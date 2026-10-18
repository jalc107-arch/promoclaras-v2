-- STAGING ONLY. Never touch payments, campaigns, awards or authorizations.
-- Valid for every calendar month (February leap/non-leap, 30, 31 days).
DO $ddl$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.campaign_daily_draws'::regclass AND conname='daily_major_calendar_month_end') THEN
  ALTER TABLE public.campaign_daily_draws ADD CONSTRAINT daily_major_calendar_month_end
  CHECK (major_prize=(EXTRACT(DAY FROM draw_date+1)=1)) NOT VALID;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.campaign_daily_draws'::regclass AND conname='daily_prize_kind_selected_before_schedule') THEN
  ALTER TABLE public.campaign_daily_draws ADD CONSTRAINT daily_prize_kind_selected_before_schedule
  CHECK (status NOT IN ('scheduled','result_pending','completed')
   OR prize_kind IN ('money','physical')) NOT VALID;
 END IF;
END $ddl$;
ALTER TABLE public.campaign_daily_draws VALIDATE CONSTRAINT daily_major_calendar_month_end;
ALTER TABLE public.campaign_daily_draws VALIDATE CONSTRAINT daily_prize_kind_selected_before_schedule;
