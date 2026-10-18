-- Two concurrent paid orders and their approvals already exist at this point.
-- Verify the new wrapper commits VOIDED receipt and ALL reversals together.
DO $atomic$
DECLARE
 first record;
 replay record;
 invalid_denied boolean:=false;
 before_events integer;
BEGIN
 SELECT count(*) INTO before_events FROM public.campaign_daily_wompi_events
 WHERE payment_id='30303030-3030-4030-8030-303030303030';
 BEGIN
  PERFORM 1 FROM public.system_daily_apply_verified_void_atomic(
  '30303030-3030-4030-8030-303030303030','sandbox_concurrent_A_1010',
   repeat('1',64),'prod',1792300700);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%Evento Wompi incompleto%' THEN invalid_denied:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT invalid_denied THEN RAISE EXCEPTION 'Unverified provider event accepted'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_wompi_events
     WHERE payment_id='30303030-3030-4030-8030-303030303030')<>before_events
 THEN RAISE EXCEPTION 'Invalid event persisted'; END IF;
 SELECT * INTO first FROM public.system_daily_apply_verified_void_atomic(
  '30303030-3030-4030-8030-303030303030','sandbox_concurrent_A_1010',
   repeat('2',64),'test',1792300701);
 IF first.revoked_count<>5 OR first.released_count<>5 OR first.already_reversed THEN
  RAISE EXCEPTION 'Atomic VOIDED did not reverse 5 tickets';
 END IF;
 IF (SELECT count(*) FROM public.campaign_daily_wompi_events
  WHERE payment_id='30303030-3030-4030-8030-303030303030'
  AND event_status='VOIDED')<>1 THEN
  RAISE EXCEPTION 'Atomic VOIDED missing immutable event receipt';
 END IF;
 SELECT * INTO replay FROM public.system_daily_apply_verified_void_atomic(
  '30303030-3030-4030-8030-303030303030','sandbox_concurrent_A_1010',
   repeat('2',64),'test',1792300701);
 IF replay.revoked_count<>0 OR replay.released_count<>0 OR NOT replay.already_reversed THEN
  RAISE EXCEPTION 'Atomic VOIDED replay is not idempotent';
 END IF;
 IF (SELECT count(*) FROM public.campaign_daily_ticket_activations
  WHERE order_id='10101010-1010-4010-8010-101010101010' AND revoked_at IS NOT NULL)<>5 THEN
  RAISE EXCEPTION 'Missing revocations after one transaction';
 END IF;
 RAISE NOTICE 'PASS: signed VOIDED receipt and 5 activations reversed atomically, replay idempotent, invalid event refused';
END $atomic$;
