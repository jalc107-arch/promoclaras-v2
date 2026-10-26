-- STAGING ONLY. Restore server-side read access needed by the Sinuano
-- daily-prize editor. Keep all documentary approvals immutable through API.
-- This corrects the read-only omission in
-- 20261018_staging_daily_documentary_approval_guard.sql.
--
-- Never grant this table to anon or authenticated.
-- Commercial/regulatory authorization gates remain unchanged.

GRANT SELECT ON TABLE public.campaign_daily_documentary_controls TO service_role;

DO $verification$
BEGIN
  IF NOT has_table_privilege('service_role',
    'public.campaign_daily_documentary_controls', 'SELECT') THEN
    RAISE EXCEPTION 'Service role cannot read documentary controls';
  END IF;
  IF has_table_privilege('service_role',
    'public.campaign_daily_documentary_controls', 'INSERT') OR
     has_table_privilege('service_role',
    'public.campaign_daily_documentary_controls', 'UPDATE') OR
     has_table_privilege('service_role',
    'public.campaign_daily_documentary_controls', 'DELETE') THEN
    RAISE EXCEPTION 'Documentary control writes must remain blocked';
  END IF;
  IF has_table_privilege('anon',
    'public.campaign_daily_documentary_controls', 'SELECT') OR
     has_table_privilege('authenticated',
    'public.campaign_daily_documentary_controls', 'SELECT') THEN
    RAISE EXCEPTION 'Documentary controls must remain private';
  END IF;
END;
$verification$;