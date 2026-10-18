-- STAGING ONLY: atomic order/ticket/activation for the exceptional daily campaign.
-- The application does NOT call this RPC while IS_DAILY_COMMERCIALLY_ENABLED=false.
-- Wompi event authenticity is enforced separately by the webhook; this function
-- additionally verifies order, provider transaction, amount and database locks.
CREATE OR REPLACE FUNCTION public.system_daily_finalize_full_payment_atomic(
  p_order_id uuid, p_provider_transaction_id text
)
RETURNS TABLE(assigned_count integer, activated_count integer, already_processed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_order public.orders%ROWTYPE;
 v_campaign public.rifas%ROWTYPE;
 v_auth public.daily_draw_campaign_authorizations%ROWTYPE;
 v_payment public.payments%ROWTYPE;
 v_count integer;
 v_act_count integer;
 v_after integer;
 v_existing integer;
 v_ticket record;
 v_price numeric;
BEGIN
 IF p_order_id IS NULL OR length(btrim(coalesce(p_provider_transaction_id,''))) < 6 THEN
   RAISE EXCEPTION 'Falta orden y comprobante verificable';
 END IF;
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orden inexistente'; END IF;
 SELECT * INTO v_campaign FROM public.rifas WHERE id=v_order.rifa_id FOR UPDATE;
 IF NOT FOUND OR v_campaign.draw_provider<>'loteria_sinuano_noche'
   OR v_campaign.draw_mode<>'loteria_4_pleno' THEN
   RAISE EXCEPTION 'Solo disponible para la modalidad diaria excepcional';
 END IF;
 SELECT * INTO v_auth FROM public.daily_draw_campaign_authorizations
 WHERE campaign_id=v_campaign.id FOR UPDATE;
 IF NOT FOUND OR v_auth.approval_status<>'approved'
    OR v_auth.regulatory_clearance IS DISTINCT FROM true
    OR v_auth.payment_provider_clearance IS DISTINCT FROM true
    OR v_auth.approved_at IS NULL OR v_auth.revoked_at IS NOT NULL
    OR v_campaign.status<>'active' OR v_campaign.is_public IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Falta autorización excepcional completa';
 END IF;
 IF v_order.payment_mode IS DISTINCT FROM 'full'
    OR v_order.qty<5 OR v_order.qty>10000
    OR v_order.buyer_id IS NULL
    OR v_order.payment_status IN ('failed','refunded','cancelled','defaulted')
    OR v_order.subtotal<=0
    OR v_order.total_paid>v_order.subtotal
    OR coalesce(v_order.balance_due,0)>v_order.subtotal THEN
   RAISE EXCEPTION 'Modalidad, cantidad, comprador o estado de orden invalido';
 END IF;
 v_price:=v_campaign.price_per_ticket;
 IF v_price<>2500 OR v_order.subtotal<>v_order.qty*v_price THEN
   RAISE EXCEPTION 'Precio o subtotal de campaña inconsistente';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.campaign_daily_draws d
   WHERE d.campaign_id=v_campaign.id AND d.scheduled_at>clock_timestamp()
     AND d.status IN ('scheduled','result_pending')
 ) THEN
   RAISE EXCEPTION 'No existe una jornada futura habilitada';
 END IF;
 SELECT p.* INTO v_payment
 FROM public.payments p
 WHERE p.order_id=v_order.id AND p.provider='wompi' AND p.status='approved'
   AND p.provider_transaction_id=btrim(p_provider_transaction_id)
   AND p.installment_id IS NULL
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pago de Wompi no esta aprobado para esta orden'; END IF;
 IF v_payment.amount<>v_order.subtotal
   OR v_payment.updated_at>clock_timestamp() THEN
   RAISE EXCEPTION 'No se confirmo un pago completo valido';
 END IF;
 IF (SELECT count(*) FROM public.payments p
     WHERE p.order_id=v_order.id AND p.provider='wompi'
       AND p.status='approved')<>1
   OR EXISTS(
     SELECT 1 FROM public.payments p
     WHERE p.provider='wompi' AND p.status='approved'
       AND p.provider_transaction_id=v_payment.provider_transaction_id
       AND p.order_id<>v_order.id
   ) THEN
   RAISE EXCEPTION 'Transaccion aprobada duplicada o compartida';
 END IF;
 -- Locking the campaign serializes all allocations of the 0000-9999 space,
 -- including retried callbacks routed to different backend instances.
 SELECT count(*) INTO v_existing FROM public.tickets t WHERE t.order_id=v_order.id;
 IF v_existing NOT IN (0,v_order.qty) THEN
   RAISE EXCEPTION 'Orden con numero parcial de codigos: detener';
 END IF;
 IF v_existing=v_order.qty AND EXISTS(
   SELECT 1 FROM public.tickets t WHERE t.order_id=v_order.id
     AND (t.rifa_id<>v_campaign.id OR t.buyer_id IS DISTINCT FROM v_order.buyer_id
       OR t.status IS DISTINCT FROM 'active' OR t.combination !~ '^[0-9]{4}$')
 ) THEN
   RAISE EXCEPTION 'Codigos existentes inconsistentes';
 END IF;
 UPDATE public.orders SET payment_status='paid',total_paid=v_order.subtotal,
   amount_paid=v_order.subtotal,balance_due=0
 WHERE id=v_order.id;
 IF v_existing=0 THEN
   WITH free AS MATERIALIZED (
     SELECT lpad(n::text,4,'0') AS number,encode(extensions.gen_random_bytes(8),'hex') AS entropy
     FROM generate_series(0,9999) n
     WHERE NOT EXISTS (
       SELECT 1 FROM public.tickets t WHERE t.rifa_id=v_campaign.id
         AND (t.combination=lpad(n::text,4,'0') OR t.ticket_code=lpad(n::text,4,'0'))
     )
   ), chosen AS (
     SELECT number FROM free ORDER BY entropy,number LIMIT v_order.qty
   )
   INSERT INTO public.tickets(rifa_id,order_id,buyer_id,ticket_code,combination,status)
   SELECT v_campaign.id,v_order.id,v_order.buyer_id,number,number,'active' FROM chosen;
   GET DIAGNOSTICS v_count=ROW_COUNT;
   IF v_count<>v_order.qty THEN
     RAISE EXCEPTION 'Capacidad insuficiente o asignacion incompleta';
   END IF;
 END IF;
 SELECT count(*) INTO v_act_count FROM public.campaign_daily_ticket_activations a
 WHERE a.order_id=v_order.id;
 IF v_act_count NOT IN (0,v_order.qty) THEN
   RAISE EXCEPTION 'Activaciones parciales: detener para reconciliacion';
 END IF;
 IF EXISTS(
   SELECT 1 FROM public.campaign_daily_ticket_activations a
   JOIN public.tickets t ON t.id=a.ticket_id
   WHERE a.order_id=v_order.id
     AND (a.campaign_id<>v_campaign.id OR a.approved_payment_id<>v_payment.id
       OR a.revoked_at IS NOT NULL OR t.status<>'active')
 ) THEN
   RAISE EXCEPTION 'Activacion revocada o inconsistente';
 END IF;
 IF v_act_count=0 THEN
   INSERT INTO public.campaign_daily_ticket_activations(
     ticket_id,campaign_id,order_id,approved_payment_id,
     payment_confirmation_at,activated_at)
   SELECT t.id,v_campaign.id,v_order.id,v_payment.id,
     clock_timestamp(),clock_timestamp()
   FROM public.tickets t WHERE t.order_id=v_order.id AND t.status='active';
 END IF;
 SELECT count(*) INTO v_after FROM public.campaign_daily_ticket_activations a
 WHERE a.order_id=v_order.id AND a.campaign_id=v_campaign.id
   AND a.approved_payment_id=v_payment.id AND a.revoked_at IS NULL;
 IF v_after<>v_order.qty THEN
   RAISE EXCEPTION 'Activaciones finales incompletas';
 END IF;
 RETURN QUERY SELECT v_order.qty,v_after,(v_existing=v_order.qty AND v_act_count=v_order.qty);
END;
$body$;
REVOKE ALL ON FUNCTION public.system_daily_finalize_full_payment_atomic(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.system_daily_finalize_full_payment_atomic(uuid,text)
 TO service_role;
