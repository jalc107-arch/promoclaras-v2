-- Isolated database. Uses real PostgreSQL 17 and all THREE versioned
-- result/activation reconciliation migrations. This is NOT actual Wompi E2E.
INSERT INTO public.rifas(id,draw_provider,draw_mode,status,is_public) VALUES
 ('11111111-1111-4111-8111-111111111111','loteria_sinuano_noche','loteria_4_pleno','active',true);
INSERT INTO public.daily_draw_campaign_authorizations VALUES
 ('11111111-1111-4111-8111-111111111111','approved',true,true,now()-interval '1 day',NULL);
INSERT INTO public.orders(id,rifa_id,payment_status,subtotal,total_paid,balance_due,created_at) VALUES
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
  'paid',12500,12500,0,now()-interval '4 hours');
INSERT INTO public.payments(id,order_id,provider,status,provider_transaction_id,amount,updated_at) VALUES
 ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333',
 'wompi','approved','sandbox_fixture_not_gateway',12500,now()-interval '3 hours');
INSERT INTO public.tickets(id,rifa_id,order_id,status,combination,created_at)
 SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
 'active',case when i=1 then '0042' else lpad(i::text,4,'0') end,
 now()-interval '3 hours' FROM generate_series(1,5) i;
INSERT INTO public.campaign_daily_ticket_activations
(ticket_id,campaign_id,order_id,approved_payment_id,payment_confirmation_at,activated_at)
 SELECT id,'11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
 '55555555-5555-4555-8555-555555555555',
 now()-interval '3 hours',now()-interval '2 hours'
 FROM public.tickets;
INSERT INTO public.campaign_daily_draws
(id,campaign_id,status,cutoff_at,scheduled_at,draw_date,major_prize,prize_kind,prize_amount,prize_description)
 SELECT ('22222222-2222-4222-8222-'||lpad(i::text,12,'0'))::uuid,
 '11111111-1111-4111-8111-111111111111',
 'scheduled',now()-interval '1 hour',now()-interval '30 minutes',
 DATE '2026-12-01'+(i-1),i=31,'money',2500,
 'Premio monetario ficticio verificable solo dentro de CI'
 FROM generate_series(1,31) i;
-- Inject a fake historical scheduling clock for synthetic examples; none of
-- these fictitious results have been published or applied to staging.
DO $validate$
DECLARE d record; answer record; winners integer:=0; no_winners integer:=0;
 replay_rejected boolean:=false; inconsistent_rejected boolean:=false;
BEGIN
 FOR d IN SELECT id,draw_date FROM public.campaign_daily_draws ORDER BY draw_date LOOP
   SELECT * INTO answer FROM public.admin_daily_draw_record_result_atomic(
    d.id,
    CASE WHEN EXTRACT(day FROM d.draw_date)::integer % 2=1 THEN '0042' ELSE '9999' END,
    'TEST_INTERNAL_DO_NOT_PUBLISH_'||d.draw_date::text,
    repeat('a',64));
   IF EXTRACT(day FROM d.draw_date)::integer % 2=1 THEN
     IF answer.outcome<>'winner' OR answer.winner_ticket_id IS NULL OR answer.eligible_count<>5 THEN
       RAISE EXCEPTION 'Expected winner for % but got %',d.draw_date,answer.outcome;
     END IF;
     winners:=winners+1;
   ELSE
     IF answer.outcome<>'no_winner' OR answer.winner_ticket_id IS NOT NULL OR answer.eligible_count<>5 THEN
       RAISE EXCEPTION 'Expected no_winner for % but got %',d.draw_date,answer.outcome;
     END IF;
     no_winners:=no_winners+1;
   END IF;
 END LOOP;
 IF winners<>16 OR no_winners<>15 THEN
   RAISE EXCEPTION 'Unexpected distribution % winners, % no_winner',winners,no_winners;
 END IF;
 IF (SELECT count(*) FROM public.campaign_daily_awards)<>16 THEN RAISE EXCEPTION 'Incorrect award count'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_audit WHERE event_kind='result_recorded')<>31 THEN
  RAISE EXCEPTION 'Incorrect result audit count'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_draws WHERE status='completed')<>31 THEN
  RAISE EXCEPTION 'Incomplete daily draws'; END IF;
 IF (SELECT status FROM public.rifas WHERE id='11111111-1111-4111-8111-111111111111')<>'active' THEN
  RAISE EXCEPTION 'Global campaign closed prematurely'; END IF;
 BEGIN
   PERFORM 1 FROM public.admin_daily_draw_record_result_atomic(
     (SELECT id FROM public.campaign_daily_draws ORDER BY draw_date LIMIT 1),
     '0042','TEST_INTERNAL_DO_NOT_PUBLISH_REPLAY',repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM LIKE '%Resultado ya procesado%' THEN replay_rejected:=true; ELSE RAISE; END IF;
 END;
 IF NOT replay_rejected THEN RAISE EXCEPTION 'Replay accepted'; END IF;
 RAISE NOTICE 'PASS: 31 draws, 16 winners, 15 no_winner, 16 awards, 31 audits, no campaign closure, replay rejected';
END $validate$;
-- The trigger must also stop a previously processed daily draw being marked
-- completed AGAIN while payment is now voided. Use a fresh scheduled row.
INSERT INTO public.campaign_daily_draws(id,campaign_id,status,cutoff_at,scheduled_at,draw_date,prize_kind,prize_amount,prize_description)
 VALUES('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',
 'scheduled',now()-interval '1 hour',now()-interval '30 minutes',DATE '2027-01-01',
 'money',2500,'Test payment reversal draft');
UPDATE public.payments SET status='failed' WHERE id='55555555-5555-4555-8555-555555555555';
DO $voided$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM 1 FROM public.admin_daily_draw_record_result_atomic(
   '99999999-9999-4999-8999-999999999999','0042',
   'TEST_INTERNAL_DO_NOT_PUBLISH_VOIDED',repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%Conciliacion diaria pendiente:%' THEN rejected:=true; ELSE RAISE; END IF;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Voided payment incorrectly allowed result'; END IF;
 IF EXISTS (SELECT 1 FROM public.campaign_daily_draws WHERE id='99999999-9999-4999-8999-999999999999' AND status='completed') THEN
   RAISE EXCEPTION 'Voided day incorrectly marked completed'; END IF;
 RAISE NOTICE 'PASS: voided payment blocked result atomically';
END $voided$;
