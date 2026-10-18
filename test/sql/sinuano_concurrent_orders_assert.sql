DO $assert$
DECLARE ticket_count integer; combination_count integer; activation_count integer;
 audit_count integer; paid_count integer;
BEGIN
 SELECT count(*),count(DISTINCT combination) INTO ticket_count,combination_count
 FROM public.tickets WHERE rifa_id='11111111-1111-4111-8111-111111111111';
 SELECT count(*) INTO activation_count FROM public.campaign_daily_ticket_activations
 WHERE campaign_id='11111111-1111-4111-8111-111111111111';
 SELECT count(*) INTO audit_count FROM public.campaign_daily_audit
 WHERE event_kind='activation_after_verified_full_payment';
 SELECT count(*) INTO paid_count FROM public.orders
 WHERE rifa_id='11111111-1111-4111-8111-111111111111' AND payment_status='paid'
 AND balance_due=0;
 IF ticket_count<>15 OR combination_count<>15 OR activation_count<>15
 OR audit_count<>15 OR paid_count<>3 THEN
   RAISE EXCEPTION 'Concurrent mismatch tickets:% combos:% activations:% audit:% paid:%',
   ticket_count,combination_count,activation_count,audit_count,paid_count;
 END IF;
 IF EXISTS(
   SELECT 1 FROM public.orders o
   WHERE o.id IN ('10101010-1010-4010-8010-101010101010','20202020-2020-4020-8020-202020202020')
   AND (SELECT count(*) FROM public.tickets t WHERE t.order_id=o.id)<>5
 ) THEN
   RAISE EXCEPTION 'One concurrent buyer did not receive five codes';
 END IF;
 RAISE NOTICE 'PASS: 2 parallel orders + 1 earlier = 15 distinct codes, 15 activations, 15 audits, 3 paid orders';
END $assert$;
