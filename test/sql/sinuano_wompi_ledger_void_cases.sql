-- PostgreSQL isolated; signed-event claims are synthetic test input,
-- not a claim of real Wompi signature verification.
DO $cases$
DECLARE duplicate boolean; v_id uuid; immutable_rejected boolean:=false;
 wrong_status boolean:=false;
BEGIN
 SELECT event_id INTO v_id FROM public.system_daily_record_verified_wompi_event(
 '55555555-5555-4555-8555-555555555555','sandbox_test_payment_001',
 'APPROVED',repeat('a',64),'test',1792300000);
 IF v_id IS NULL THEN RAISE EXCEPTION 'APPROVED idempotent receipt absent'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_wompi_events
    WHERE payment_id='55555555-5555-4555-8555-555555555555' AND event_status='APPROVED')<>1
 THEN RAISE EXCEPTION 'Duplicate approval receipts'; END IF;
 BEGIN
   UPDATE public.campaign_daily_wompi_events SET event_status='VOIDED'
   WHERE id=v_id;
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM LIKE '%historial de eventos Wompi es inmutable%' THEN immutable_rejected:=true; ELSE RAISE; END IF;
 END;
 IF NOT immutable_rejected THEN RAISE EXCEPTION 'Receipt mutated'; END IF;
 BEGIN
   PERFORM 1 FROM public.system_daily_record_verified_wompi_event(
     '55555555-5555-4555-8555-555555555555','sandbox_test_payment_001',
     'VOIDED',repeat('d',64),'prod',1792300300);
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM LIKE '%Evento Wompi incompleto%' THEN wrong_status:=true; ELSE RAISE; END IF;
 END;
 IF NOT wrong_status THEN RAISE EXCEPTION 'Production event accepted in staging'; END IF;
 RAISE NOTICE 'PASS: append-only event, replay idempotency, updates forbidden, prod event refused';
END $cases$;
SELECT * FROM public.system_daily_record_verified_wompi_event(
 '55555555-5555-4555-8555-555555555555','sandbox_test_payment_001',
 'VOIDED',repeat('e',64),'test',1792300400);
-- Simulate the narrow gap after the signed VOIDED receipt but before
-- the atomic reversal completes. The result update MUST fail closed.
DO $gap$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  UPDATE public.campaign_daily_draws SET status='completed'
  WHERE id='22222222-2222-4222-8222-222222222222';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%VOIDED verificado pendiente de conciliación%' THEN
    rejected:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT rejected THEN
   RAISE EXCEPTION 'VOIDED ledger was ignored before reversal';
 END IF;
 RAISE NOTICE 'PASS: VOIDED signed receipt prevents result while reversal pending';
END $gap$;
DO $void$
DECLARE r record; status_fail boolean:=false; reapproval_rejected boolean:=false;
BEGIN
 SELECT * INTO r FROM public.system_daily_void_full_payment_atomic(
   '33333333-3333-4333-8333-333333333333','sandbox_test_payment_001');
 IF r.revoked_count<>5 OR r.released_count<>5 OR r.already_reversed THEN
   RAISE EXCEPTION 'Atomic reverse first attempt: %',row_to_json(r);
 END IF;
 IF (SELECT count(*) FROM public.campaign_daily_ticket_activations
 WHERE order_id='33333333-3333-4333-8333-333333333333' AND revoked_at IS NOT NULL)<>5 THEN
   RAISE EXCEPTION 'Not all 5 activations revoked';
 END IF;
 IF (SELECT count(*) FROM public.tickets
 WHERE order_id='33333333-3333-4333-8333-333333333333' AND status='released')<>5 THEN
   RAISE EXCEPTION 'Not all 5 codes released';
 END IF;
 IF (SELECT count(*) FROM public.campaign_daily_audit
 WHERE event_kind='activation_revoked')<>5 OR
 (SELECT count(*) FROM public.campaign_daily_audit
 WHERE event_kind='wompi_voided_atomic')<>1 THEN
  RAISE EXCEPTION 'Revocation or reversal audit mismatch';
 END IF;
 SELECT * INTO r FROM public.system_daily_void_full_payment_atomic(
   '33333333-3333-4333-8333-333333333333','sandbox_test_payment_001');
 IF r.revoked_count<>0 OR r.released_count<>0 OR NOT r.already_reversed THEN
   RAISE EXCEPTION 'Reversal replay was not idempotent';
 END IF;
 BEGIN
  PERFORM 1 FROM public.system_daily_record_verified_wompi_event(
  '55555555-5555-4555-8555-555555555555','sandbox_test_payment_001',
  'APPROVED',repeat('f',64),'test',1792300500);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%No se puede reactivar un pago anulado%' THEN reapproval_rejected:=true; ELSE RAISE; END IF;
 END;
 IF NOT reapproval_rejected THEN RAISE EXCEPTION 'A late APPROVED resurrected a VOIDED payment'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_wompi_events
  WHERE payment_id='55555555-5555-4555-8555-555555555555')<>2 THEN
   RAISE EXCEPTION 'Event count after replay changed';
 END IF;
 RAISE NOTICE 'PASS: VOIDED atomic, 5 revocations, 5 releases, immutable audits, idempotent replay, late APPROVED rejected';
END $void$;
