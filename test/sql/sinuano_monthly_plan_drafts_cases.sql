-- No production Supabase objects or live transaction data used.
DO $tests$
DECLARE a record;b record;c record;invalid boolean:=false;bad_campaign boolean:=false;not_editable boolean:=false;
BEGIN
 SELECT * INTO a FROM public.admin_daily_save_month_plan_draft(
 '11111111-1111-4111-8111-111111111111',2028,2,
 NULL,NULL,NULL,NULL,repeat('a',64));
 IF a.revision_number<>1 OR a.day_count<>29 OR a.major_day<>DATE '2028-02-29' THEN
 RAISE EXCEPTION 'Leap February draft incorrect: %',row_to_json(a); END IF;
 SELECT * INTO b FROM public.admin_daily_save_month_plan_draft(
 '11111111-1111-4111-8111-111111111111',2028,2,
 'money','Premio en dinero propuesto',12500000,NULL,repeat('a',64));
 IF b.revision_number<>2 OR b.day_count<>29 THEN RAISE EXCEPTION 'Revision lost'; END IF;
 SELECT * INTO c FROM public.admin_daily_save_month_plan_draft(
 '11111111-1111-4111-8111-111111111111',2027,4,
 'physical','Dos motocicletas solo en borrador',NULL,2,repeat('a',64));
 IF c.day_count<>30 OR c.major_day<>DATE '2027-04-30' THEN RAISE EXCEPTION 'April plan incorrect'; END IF;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_month_plan_draft(
 '11111111-1111-4111-8111-111111111111',2027,12,
 'money','Dinero y motos no permitidos',12500000,2,repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%un único premio mayor%' THEN invalid:=true; ELSE RAISE; END IF;
 END;
 BEGIN
 PERFORM 1 FROM public.admin_daily_save_month_plan_draft(
 '22222222-2222-4222-8222-222222222222',2027,4,
 NULL,NULL,NULL,NULL,repeat('a',64));
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%Solo se admiten borradores%' THEN bad_campaign:=true; ELSE RAISE; END IF;
 END;
 BEGIN
 UPDATE public.campaign_daily_monthly_plan_drafts SET major_prize_kind='physical'
 WHERE id=b.draft_id;
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM LIKE '%inmutables%' THEN not_editable:=true; ELSE RAISE; END IF;
 END;
 IF NOT(invalid AND bad_campaign AND not_editable) THEN
 RAISE EXCEPTION 'Major prize, legacy isolation or audit mutation guard failed';
 END IF;
 IF (SELECT count(*) FROM public.campaign_daily_monthly_plan_drafts)<>3 THEN
 RAISE EXCEPTION 'Unexpected draft count'; END IF;
 IF (SELECT count(*) FROM public.campaign_daily_audit
 WHERE event_kind='monthly_draft_revision_added')<>3 THEN
 RAISE EXCEPTION 'Missing month revision audit'; END IF;
 IF has_table_privilege('anon','public.campaign_daily_monthly_plan_drafts','INSERT')
 OR has_table_privilege('authenticated','public.campaign_daily_monthly_plan_drafts','SELECT')
 THEN RAISE EXCEPTION 'Public monthly drafts permissions incorrect'; END IF;
 RAISE NOTICE 'PASS: immutable month draft 29/30 days, one prize choice, revisions and audit, private to admin, ordinary campaigns unchanged';
END $tests$;
