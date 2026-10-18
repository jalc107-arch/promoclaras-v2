-- STAGING ONLY. Close race between verified VOIDED ledger insert and atomic
-- ticket/payment reversal. If reversal RPC retries later, a daily result must
-- still block while a VOIDED ledger entry exists.
CREATE OR REPLACE FUNCTION public.enforce_daily_draw_verified_void_receipts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
BEGIN
 IF TG_OP<>'UPDATE' OR NEW.status IS DISTINCT FROM 'completed'
   OR OLD.status='completed' THEN RETURN NEW; END IF;
 IF EXISTS (
   SELECT 1 FROM public.campaign_daily_wompi_events e
   JOIN public.campaign_daily_ticket_activations a
     ON a.campaign_id=e.campaign_id AND a.order_id=e.order_id
       AND a.approved_payment_id=e.payment_id
   WHERE e.campaign_id=NEW.campaign_id
     AND e.event_status='VOIDED'
     AND a.activated_at<=NEW.cutoff_at
     AND (a.revoked_at IS NULL OR a.revoked_at>NEW.cutoff_at)
 ) THEN
  RAISE EXCEPTION 'VOIDED verificado pendiente de conciliación: no publicar resultado';
 END IF;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.enforce_daily_draw_verified_void_receipts()
 FROM PUBLIC,anon,authenticated;
DO $install$
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.campaign_daily_draws'::regclass
     AND tgname='trg_daily_verified_void_receipts'
     AND NOT tgisinternal
 ) THEN
   CREATE TRIGGER trg_daily_verified_void_receipts
   BEFORE UPDATE ON public.campaign_daily_draws
   FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_draw_verified_void_receipts();
 END IF;
END;
$install$;
