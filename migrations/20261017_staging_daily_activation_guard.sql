-- STAGING ONLY. Requires 20261017_staging_daily_draws_admin_guard.sql.
-- Reject fabricated activations, partial installments and retroactive purchases.
-- Not connected to Wompi callback in this development phase.
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_daily_activation_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_ticket public.tickets%ROWTYPE;
 v_order public.orders%ROWTYPE;
 v_payment public.payments%ROWTYPE;
 v_paid numeric;
 v_last_approval timestamptz;
 v_authorized boolean;
 v_now timestamptz := clock_timestamp();
BEGIN
 IF TG_OP='UPDATE' AND
   (NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR
    NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR
    NEW.order_id IS DISTINCT FROM OLD.order_id OR
    NEW.approved_payment_id IS DISTINCT FROM OLD.approved_payment_id OR
    NEW.activated_at IS DISTINCT FROM OLD.activated_at OR
    NEW.payment_confirmation_at IS DISTINCT FROM OLD.payment_confirmation_at) THEN
    RAISE EXCEPTION 'La activación es inmutable: solo puede registrarse revocación';
 END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
     RAISE EXCEPTION 'No se permite eliminar ni cambiar revocaciones anteriores';
   END IF;
   IF NEW.revoked_at IS NOT NULL THEN
     IF length(btrim(coalesce(NEW.revoked_reason,''))) < 15 THEN
       RAISE EXCEPTION 'La revocación necesita motivo auditable';
     END IF;
     NEW.revoked_at:=clock_timestamp();
   END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO v_ticket FROM public.tickets WHERE id=NEW.ticket_id FOR UPDATE;
 SELECT * INTO v_order FROM public.orders WHERE id=NEW.order_id FOR UPDATE;
 SELECT * INTO v_payment FROM public.payments WHERE id=NEW.approved_payment_id FOR UPDATE;
 IF NOT FOUND OR v_ticket.id IS NULL OR v_order.id IS NULL OR v_payment.id IS NULL THEN
   RAISE EXCEPTION 'Código, orden o pago inexistente';
 END IF;
 IF v_ticket.order_id<>v_order.id OR v_ticket.rifa_id<>NEW.campaign_id OR
    v_order.rifa_id<>NEW.campaign_id OR v_ticket.status<>'active' OR
    v_order.payment_status<>'paid' OR v_order.subtotal<=0 OR
    coalesce(v_order.balance_due,0)<>0 OR v_order.total_paid<v_order.subtotal THEN
   RAISE EXCEPTION 'Compra no habilitada o reserva sin pagar';
 END IF;
 SELECT true INTO v_authorized FROM public.rifas r
 JOIN public.daily_draw_campaign_authorizations auth ON auth.campaign_id=r.id
 WHERE r.id=NEW.campaign_id AND r.draw_provider='loteria_sinuano_noche'
   AND r.draw_mode='loteria_4_pleno' AND r.status='active' AND r.is_public=true
   AND auth.approval_status='approved' AND auth.regulatory_clearance=true
   AND auth.payment_provider_clearance=true AND auth.approved_at IS NOT NULL
   AND auth.revoked_at IS NULL;
 IF v_authorized IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'La campaña no dispone de autorización comercial excepcional';
 END IF;
 IF v_payment.order_id<>v_order.id OR v_payment.status<>'approved' OR
   v_payment.provider<>'wompi' OR
   nullif(btrim(coalesce(v_payment.provider_transaction_id,'')),'') IS NULL THEN
   RAISE EXCEPTION 'No existe pago aprobado por Wompi para esta orden';
 END IF;
 SELECT coalesce(sum(amount),0),max(updated_at) INTO v_paid,v_last_approval
 FROM public.payments p
 WHERE p.order_id=v_order.id AND p.provider='wompi' AND p.status='approved'
   AND nullif(btrim(coalesce(p.provider_transaction_id,'')),'') IS NOT NULL;
 IF v_paid<v_order.subtotal OR v_last_approval IS NULL OR v_last_approval>v_now THEN
   RAISE EXCEPTION 'Pago incompleto, no confirmado o fecha inválida';
 END IF;
 -- Ignore any client-supplied activation time to prevent backdating.
 NEW.payment_confirmation_at:=v_last_approval;
 NEW.activated_at:=v_now;
 NEW.revoked_at:=NULL;
 NEW.revoked_reason:=NULL;
 INSERT INTO public.campaign_daily_audit(campaign_id,event_kind,actor_fingerprint,details)
 VALUES(NEW.campaign_id,'activation_after_verified_full_payment',
   encode(sha256(convert_to('SYSTEM_WOMPI_VERIFIED','UTF8')),'hex'),
   jsonb_build_object('ticket_id',NEW.ticket_id,'order_id',NEW.order_id,
   'approved_payment_id',NEW.approved_payment_id,
   'activated_at',NEW.activated_at));
 RETURN NEW;
END;
$body$;
CREATE OR REPLACE TRIGGER trg_daily_activation_integrity BEFORE INSERT OR UPDATE ON public.campaign_daily_ticket_activations
FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_activation_integrity();
REVOKE ALL ON FUNCTION public.enforce_daily_activation_integrity() FROM PUBLIC,anon,authenticated;
-- This trigger function is called by the database; no external EXECUTE grant.
COMMIT;
