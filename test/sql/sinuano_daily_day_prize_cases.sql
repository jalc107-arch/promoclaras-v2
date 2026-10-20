-- Isolated PostgreSQL 17: executes after monthly plan fixture tests.
DO $cases$
DECLARE plan_id uuid;older_plan uuid;r record; r2 record;
 reused boolean:=false;major boolean:=false;outside_month boolean:=false;
 stale boolean:=false;traditional boolean:=false;immutable boolean:=false; null_kind boolean:=false;
 request_a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 request_b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
BEGIN
 SELECT id INTO plan_id FROM public.campaign_daily_monthly_plan_drafts
 WHERE campaign_id='11111111-1111-4111-8111-111111111111'
 AND year_number=2028 AND month_number=2 AND revision=2;
 SELECT id INTO older_plan FROM public.campaign_daily_monthly_plan_drafts
 WHERE campaign_id='11111111-1111-4111-8111-111111111111'
 AND year_number=2028 AND month_number=2 AND revision=1;
 IF plan_id IS NULL OR older_plan IS NULL THEN RAISE EXCEPTION 'Missing monthly fixtures'; END IF;
 SELECT * INTO r FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',plan_id,
  '2028-02-01','2028-02-03','money','Premio de prueba en dinero',
  120000,NULL,NULL,request_a,repeat('a',64));
 IF r.saved_days<>3 OR r.replayed THEN RAISE EXCEPTION 'Incomplete 3-day money draft'; END IF;
 SELECT * INTO r2 FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',plan_id,
  '2028-02-01','2028-02-03','money','Premio de prueba en dinero',
  120000,NULL,NULL,request_a,repeat('a',64));
 IF r2.saved_days<>3 OR NOT r2.replayed THEN RAISE EXCEPTION 'Replay duplicated rows'; END IF;
 SELECT * INTO r FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',plan_id,
  '2028-02-02','2028-02-02','physical','Una propuesta de bien nuevo',
  NULL,2,450000,request_b,repeat('a',64));
 IF r.saved_days<>1 OR r.replayed THEN RAISE EXCEPTION 'Physical revision failed'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_day_prize_drafts)<>4
 OR (SELECT max(revision) FROM public.campaign_daily_day_prize_drafts
     WHERE draw_date='2028-02-02')<>2 THEN
  RAISE EXCEPTION 'Revision overwrote history or created duplicates'; END IF;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',plan_id,
  '2028-02-01','2028-02-03','money','Premio distinto de prueba',
  120000,NULL,NULL,request_a,repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%Petición repetida%' THEN reused:=true; ELSE RAISE; END IF; END;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',plan_id,
  '2028-02-29','2028-02-29','money','Premio del último día',
  20000,NULL,NULL,gen_random_uuid(),repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%reservada al premio mayor%' THEN major:=true; ELSE RAISE; END IF; END;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',plan_id,
  '2028-01-31','2028-02-02','money','Fuera de mes de prueba',
  20000,NULL,NULL,gen_random_uuid(),repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%fuera del mes%' THEN outside_month:=true; ELSE RAISE; END IF; END;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',older_plan,
  '2028-02-01','2028-02-01','money','Una revisión anterior',
  20000,NULL,NULL,gen_random_uuid(),repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%plan mensual más reciente%' THEN stale:=true; ELSE RAISE; END IF; END;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_day_prize_drafts(
  '22222222-2222-4222-8222-222222222222',plan_id,
  '2028-02-01','2028-02-01','money','Campaña tradicional protegida',
  20000,NULL,NULL,gen_random_uuid(),repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%borradores privados%' THEN traditional:=true; ELSE RAISE; END IF; END;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_day_prize_drafts(
  '11111111-1111-4111-8111-111111111111',plan_id,
  '2028-02-04','2028-02-04',NULL,'Tipo nulo no permitido',
  NULL,NULL,NULL,gen_random_uuid(),repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%dinero O especie%' THEN null_kind:=true; ELSE RAISE; END IF; END;
 BEGIN
 UPDATE public.campaign_daily_day_prize_drafts SET cash_amount=1
 WHERE request_id=request_a;
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%inmutables%' THEN immutable:=true; ELSE RAISE; END IF; END;
 IF NOT (reused AND major AND outside_month AND stale AND traditional AND immutable AND null_kind)
 THEN RAISE EXCEPTION 'One or more daily prize security controls failed'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_audit
 WHERE event_kind='daily_draft_prizes_saved')<>2
 OR (SELECT count(*) FROM public.campaign_daily_day_prize_drafts)<>4 THEN
 RAISE EXCEPTION 'Idempotency or audit counts incorrect'; END IF;
 IF has_table_privilege('anon','public.campaign_daily_day_prize_drafts','INSERT')
 OR has_table_privilege('authenticated','public.campaign_daily_day_prize_drafts','SELECT')
 OR has_function_privilege('anon',
 'public.admin_daily_save_day_prize_drafts(uuid,uuid,date,date,text,text,numeric,integer,numeric,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Daily draft exposed to public roles'; END IF;
 RAISE NOTICE 'PASS: 3 daily proposals, range, replay, overlapping revision, end-of-month exclusivity, immutable history, private roles';
END $cases$;
