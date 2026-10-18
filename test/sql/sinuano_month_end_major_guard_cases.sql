-- PostgreSQL 17 ephemeral, executed after original result cases.
DO $cases$
DECLARE c uuid:='11111111-1111-4111-8111-111111111111';
 wrong_major boolean:=false;missing_major boolean:=false;undefined_prize boolean:=false;
BEGIN
 INSERT INTO public.campaign_daily_draws(id,campaign_id,status,draw_date,major_prize,prize_kind)
 VALUES(gen_random_uuid(),c,'draft',DATE '2028-02-29',true,'undetermined'),
 (gen_random_uuid(),c,'draft',DATE '2027-04-30',true,'undetermined');
 BEGIN
 INSERT INTO public.campaign_daily_draws(id,campaign_id,status,draw_date,major_prize,prize_kind)
 VALUES(gen_random_uuid(),c,'draft',DATE '2028-02-28',true,'undetermined');
 EXCEPTION WHEN check_violation THEN wrong_major:=true; END;
 BEGIN
 INSERT INTO public.campaign_daily_draws(id,campaign_id,status,draw_date,major_prize,prize_kind)
 VALUES(gen_random_uuid(),c,'draft',DATE '2027-04-30',false,'undetermined');
 EXCEPTION WHEN check_violation THEN missing_major:=true; END;
 BEGIN
 INSERT INTO public.campaign_daily_draws(id,campaign_id,status,draw_date,major_prize,prize_kind)
 VALUES(gen_random_uuid(),c,'scheduled',DATE '2027-03-15',false,'undetermined');
 EXCEPTION WHEN check_violation THEN undefined_prize:=true; END;
 IF NOT(wrong_major AND missing_major AND undefined_prize) THEN
  RAISE EXCEPTION 'Calendar-month safeguards were not effective';
 END IF;
 RAISE NOTICE 'PASS: leap day, 30th-day major allowed; other major days and undefined scheduled prize forbidden';
END $cases$;
