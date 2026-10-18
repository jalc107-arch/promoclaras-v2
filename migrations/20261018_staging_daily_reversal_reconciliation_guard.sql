-- STAGING ONLY. Fail-closed reconciliation when a daily draw is completed.
-- Additive trigger: does not change legacy Wompi, payment, order or raffle handlers.
-- Must be applied after the daily draw table + payment activation migrations.
CREATE OR REPLACE FUNCTION public.enforce_daily_draw_payment_reconciliation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF TG_OP<>'UPDATE' OR NEW.status IS DISTINCT FROM 'completed'
    OR OLD.status='completed' THEN
   RETURN NEW;
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.rifas r
   WHERE r.id=NEW.campaign_id
     AND r.draw_provider='loteria_sinuano_noche'
     AND r.draw_mode='loteria_4_pleno'
 ) THEN
   RETURN NEW;
 END IF;
 IF NEW.cutoff_at IS NULL OR NEW.scheduled_at IS NULL
    OR NEW.cutoff_at>NEW.scheduled_at THEN
   RAISE EXCEPTION 'Conciliacion diaria: faltan fechas de corte validas';
 END IF;

 -- Paid-and-activated combinations may not disappear from the eligibility
 -- tally silently when Wompi later reports a reversal or provider mismatch.
 IF EXISTS (
   SELECT 1
   FROM public.campaign_daily_ticket_activations a
   LEFT JOIN public.tickets t ON t.id=a.ticket_id
   LEFT JOIN public.orders o ON o.id=a.order_id
   LEFT JOIN public.payments p ON p.id=a.approved_payment_id
   WHERE a.campaign_id=NEW.campaign_id
     AND a.activated_at<=NEW.cutoff_at
     AND (a.revoked_at IS NULL OR a.revoked_at>NEW.cutoff_at)
     AND (
       t.id IS NULL OR t.order_id IS DISTINCT FROM a.order_id
       OR t.rifa_id IS DISTINCT FROM NEW.campaign_id
       OR t.status IS DISTINCT FROM 'active'
       OR o.id IS NULL OR o.rifa_id IS DISTINCT FROM NEW.campaign_id
       OR o.payment_status IS DISTINCT FROM 'paid'
       OR o.subtotal<=0 OR o.total_paid<o.subtotal
       OR coalesce(o.balance_due,0)<>0
       OR p.id IS NULL OR p.order_id IS DISTINCT FROM a.order_id
       OR p.provider IS DISTINCT FROM 'wompi'
       OR p.status IS DISTINCT FROM 'approved'
       OR nullif(btrim(p.provider_transaction_id),'') IS NULL
       OR (SELECT coalesce(sum(v.amount),0)
           FROM public.payments v
           WHERE v.order_id=a.order_id AND v.provider='wompi'
             AND v.status='approved'
             AND nullif(btrim(v.provider_transaction_id),'') IS NOT NULL
          ) < o.subtotal
     )
 ) THEN
   RAISE EXCEPTION 'Conciliacion diaria pendiente: pago revertido o activacion inconsistente';
 END IF;

 -- A pre-cutoff active code attached to an order marked paid needs to be
 -- reconciled with the amount currently approved by Wompi.
 IF EXISTS (
   SELECT 1 FROM public.orders o
   WHERE o.rifa_id=NEW.campaign_id AND o.payment_status='paid'
     AND o.created_at<=NEW.cutoff_at
     AND EXISTS (
       SELECT 1 FROM public.tickets t
       WHERE t.rifa_id=NEW.campaign_id AND t.order_id=o.id
         AND t.status='active' AND t.created_at<=NEW.cutoff_at
     )
     AND (
       o.subtotal<=0 OR o.total_paid<o.subtotal
       OR coalesce(o.balance_due,0)<>0
       OR (SELECT coalesce(sum(p.amount),0)
           FROM public.payments p
           WHERE p.order_id=o.id AND p.provider='wompi'
             AND p.status='approved'
             AND nullif(btrim(p.provider_transaction_id),'') IS NOT NULL
             AND p.updated_at<=NEW.cutoff_at
          ) < o.subtotal
     )
 ) THEN
   RAISE EXCEPTION 'Conciliacion diaria pendiente: orden pagada sin Wompi conciliado';
 END IF;

 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_daily_draw_payment_reconciliation()
 FROM PUBLIC, anon, authenticated;
DO $do$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.campaign_daily_draws'::regclass
     AND tgname='trg_daily_result_reconciliation'
     AND NOT tgisinternal
 ) THEN
   CREATE TRIGGER trg_daily_result_reconciliation
   BEFORE UPDATE ON public.campaign_daily_draws
   FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_draw_payment_reconciliation();
 END IF;
END;
$do$;
