-- The actual migration's trigger is exercised against this isolated database.
-- All IDs, money amounts and states are fictional. No Wompi requests.
INSERT INTO public.rifas VALUES
 ('11111111-1111-4111-8111-111111111111','loteria_sinuano_noche','loteria_4_pleno'),
 ('66666666-6666-4666-8666-666666666666','loteria_boyaca','loteria_3_primeras');
INSERT INTO public.campaign_daily_draws VALUES
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','scheduled',now()+interval '1 hour',now()+interval '2 hours'),
 ('77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666','scheduled',now()+interval '1 hour',now()+interval '2 hours');
INSERT INTO public.orders(id,rifa_id,payment_status,subtotal,total_paid,balance_due)
 VALUES('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','paid',12500,12500,0);
INSERT INTO public.payments(id,order_id,provider,status,provider_transaction_id,amount)
 VALUES('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','wompi','approved','sandbox_fake_test_only',12500);
INSERT INTO public.tickets(id,order_id,rifa_id,status)
 VALUES('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111','active');
INSERT INTO public.campaign_daily_ticket_activations
(ticket_id,campaign_id,order_id,approved_payment_id,activated_at)
 VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555',now());

-- Valid paid and activated draw is allowed.
UPDATE public.campaign_daily_draws SET status='completed' WHERE id='22222222-2222-4222-8222-222222222222';
DO $$ BEGIN
 IF (SELECT status FROM public.campaign_daily_draws WHERE id='22222222-2222-4222-8222-222222222222') <> 'completed'
 THEN RAISE EXCEPTION 'VALID_PAYMENT_NOT_ACCEPTED'; END IF;
END $$;
UPDATE public.campaign_daily_draws SET status='scheduled' WHERE id='22222222-2222-4222-8222-222222222222';

-- Formerly approved payment is reversed but its order/activation are stale.
UPDATE public.payments SET status='failed' WHERE id='55555555-5555-4555-8555-555555555555';
DO $case$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  UPDATE public.campaign_daily_draws SET status='completed'
  WHERE id='22222222-2222-4222-8222-222222222222';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%pago revertido o activacion inconsistente%' THEN rejected:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'REVERSED_PAYMENT_ALLOWED_COMPLETION'; END IF;
 IF (SELECT status FROM public.campaign_daily_draws WHERE id='22222222-2222-4222-8222-222222222222')<>'scheduled'
 THEN RAISE EXCEPTION 'RESULT_STATUS_CHANGED_AFTER_DENIAL'; END IF;
END $case$;

-- Refunded active tickets still cannot close a daily draw without activation.
DELETE FROM public.campaign_daily_ticket_activations;
DO $case$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  UPDATE public.campaign_daily_draws SET status='completed'
  WHERE id='22222222-2222-4222-8222-222222222222';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%orden pagada sin Wompi conciliado%' THEN rejected:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'REFUNDED_PAID_ORDER_ALLOWED_COMPLETION'; END IF;
END $case$;

-- The new trigger has no effect on traditional lottery campaigns.
UPDATE public.campaign_daily_draws SET status='completed'
 WHERE id='77777777-7777-4777-8777-777777777777';
DO $$ BEGIN
 IF (SELECT status FROM public.campaign_daily_draws WHERE id='77777777-7777-4777-8777-777777777777') <> 'completed'
 THEN RAISE EXCEPTION 'TRADITIONAL_CAMPAIGN_REGRESSION'; END IF;
END $$;
SELECT 'PASS: paid, reversed, refunded without activation and traditional isolation' AS result;
