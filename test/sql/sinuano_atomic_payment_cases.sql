-- This exercise uses the actual SQL activation trigger and full-payment
-- RPC, plus fake payments. There is NO outbound Wompi request or real sale.
INSERT INTO public.rifas(id,draw_provider,draw_mode,status,is_public,price_per_ticket)
 VALUES('11111111-1111-4111-8111-111111111111','loteria_sinuano_noche','loteria_4_pleno','active',true,2500),
       ('66666666-6666-4666-8666-666666666666','loteria_boyaca','loteria_3_primeras','active',true,2500);
INSERT INTO public.daily_draw_campaign_authorizations
 VALUES('11111111-1111-4111-8111-111111111111','approved',true,true,now(),NULL);
INSERT INTO public.campaign_daily_draws(id,campaign_id,status,cutoff_at,scheduled_at)
 VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
  'scheduled',now()+interval '1 day',now()+interval '2 days');
INSERT INTO public.orders(id,rifa_id,payment_status,subtotal,total_paid,balance_due,qty,buyer_id,payment_mode)
 VALUES('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
 'created',12500,0,12500,5,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','full');
INSERT INTO public.payments(id,order_id,provider,status,provider_transaction_id,amount)
 VALUES('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333',
 'wompi','approved','sandbox_test_payment_001',12500);
DO $cases$
DECLARE result record; t_count integer; a_count integer; dup_count integer;
 rejected_partial boolean:=false; rejected_legacy boolean:=false;
BEGIN
 SELECT * INTO result FROM public.system_daily_finalize_full_payment_atomic(
 '33333333-3333-4333-8333-333333333333','sandbox_test_payment_001');
 IF result.assigned_count<>5 OR result.activated_count<>5 OR result.already_processed THEN
  RAISE EXCEPTION 'Full payment failed: %',row_to_json(result);
 END IF;
 SELECT count(*),count(DISTINCT combination) INTO t_count,dup_count FROM public.tickets
 WHERE order_id='33333333-3333-4333-8333-333333333333';
 SELECT count(*) INTO a_count FROM public.campaign_daily_ticket_activations
 WHERE order_id='33333333-3333-4333-8333-333333333333';
 IF t_count<>5 OR dup_count<>5 OR a_count<>5 THEN RAISE EXCEPTION 'Ticket or activation totals invalid'; END IF;
 IF EXISTS(SELECT 1 FROM public.tickets WHERE rifa_id='11111111-1111-4111-8111-111111111111'
  AND (combination !~ '^[0-9]{4}$' OR ticket_code<>combination)) THEN RAISE EXCEPTION 'Malformed automatic assignment'; END IF;
 IF (SELECT payment_status FROM public.orders WHERE id='33333333-3333-4333-8333-333333333333')<>'paid'
 OR (SELECT balance_due FROM public.orders WHERE id='33333333-3333-4333-8333-333333333333')<>0
 THEN RAISE EXCEPTION 'Order not finalized'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_audit WHERE event_kind='activation_after_verified_full_payment')<>5
 THEN RAISE EXCEPTION 'Missing activation audit'; END IF;
 SELECT * INTO result FROM public.system_daily_finalize_full_payment_atomic(
 '33333333-3333-4333-8333-333333333333','sandbox_test_payment_001');
 IF result.assigned_count<>5 OR result.activated_count<>5 OR NOT result.already_processed THEN
   RAISE EXCEPTION 'Payment webhook replay was not idempotent';
 END IF;
 IF (SELECT count(*) FROM public.tickets)<>5 OR
  (SELECT count(*) FROM public.campaign_daily_ticket_activations)<>5 THEN
   RAISE EXCEPTION 'Replay generated duplicate codes or activations';
 END IF;
 RAISE NOTICE 'PASS: 5 assigned and activated, verified full payment, 5 audit events, replay idempotent';
END $cases$;
-- Partially paid orders are never activated, regardless of declared status.
INSERT INTO public.orders(id,rifa_id,payment_status,subtotal,total_paid,balance_due,qty,buyer_id,payment_mode)
 VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
 'created',12500,0,12500,5,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','full');
INSERT INTO public.payments(id,order_id,provider,status,provider_transaction_id,amount)
 VALUES('88888888-8888-4888-8888-888888888888','44444444-4444-4444-8444-444444444444',
 'wompi','approved','sandbox_test_partial_002',5000);
INSERT INTO public.orders(id,rifa_id,payment_status,subtotal,total_paid,balance_due,qty,buyer_id,payment_mode)
 VALUES('99999999-9999-4999-8999-999999999999','66666666-6666-4666-8666-666666666666',
 'created',12500,0,12500,5,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','full');
INSERT INTO public.payments(id,order_id,provider,status,provider_transaction_id,amount)
 VALUES('77777777-7777-4777-8777-777777777777','99999999-9999-4999-8999-999999999999',
 'wompi','approved','sandbox_test_legacy_003',12500);
DO $negative$
DECLARE blocked_partial boolean:=false; blocked_legacy boolean:=false;
BEGIN
 BEGIN
  PERFORM 1 FROM public.system_daily_finalize_full_payment_atomic(
   '44444444-4444-4444-8444-444444444444','sandbox_test_partial_002');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%No se confirmo un pago completo valido%' THEN blocked_partial:=true;
  ELSE RAISE; END IF;
 END;
 BEGIN
  PERFORM 1 FROM public.system_daily_finalize_full_payment_atomic(
   '99999999-9999-4999-8999-999999999999','sandbox_test_legacy_003');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%Solo disponible para la modalidad diaria excepcional%' THEN blocked_legacy:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT blocked_partial OR NOT blocked_legacy THEN RAISE EXCEPTION 'Failed partial/legacy isolation'; END IF;
 IF EXISTS(SELECT 1 FROM public.tickets WHERE order_id IN(
 '44444444-4444-4444-8444-444444444444','99999999-9999-4999-8999-999999999999'))
 THEN RAISE EXCEPTION 'Unpaid or traditional order has Sinuano tickets'; END IF;
 RAISE NOTICE 'PASS: partial payment and traditional campaigns rejected';
END $negative$;
