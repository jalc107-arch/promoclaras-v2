-- STAGING ONLY: append-only monthly draft. ONE selected major prize type per
-- revision, never both. Does not create official draws or authorize commerce.
CREATE TABLE IF NOT EXISTS public.campaign_daily_monthly_plan_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
 year_number integer NOT NULL CHECK (year_number BETWEEN 2026 AND 2100),
 month_number integer NOT NULL CHECK (month_number BETWEEN 1 AND 12),
 revision integer NOT NULL CHECK (revision >= 1),
 calendar_days integer NOT NULL CHECK (calendar_days BETWEEN 28 AND 31),
 last_draw_date date NOT NULL,
 major_prize_kind text CHECK (major_prize_kind IN ('money','physical')),
 major_prize_description text,
 major_prize_amount numeric(14,2),
 major_prize_quantity integer,
 preparation_status text NOT NULL DEFAULT 'draft' CHECK (preparation_status='draft'),
 actor_fingerprint text NOT NULL CHECK (actor_fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(campaign_id,year_number,month_number,revision),
 CONSTRAINT daily_monthly_one_major_choice CHECK (
  (major_prize_kind IS NULL AND major_prize_description IS NULL
    AND major_prize_amount IS NULL AND major_prize_quantity IS NULL)
  OR
  (major_prize_kind='money' AND length(btrim(major_prize_description)) BETWEEN 12 AND 800
    AND major_prize_amount > 0 AND major_prize_quantity IS NULL)
  OR
  (major_prize_kind='physical' AND length(btrim(major_prize_description)) BETWEEN 12 AND 800
    AND major_prize_amount IS NULL AND major_prize_quantity > 0)
 ),
 CONSTRAINT daily_monthly_last_date_correct CHECK (
  last_draw_date = (make_date(year_number,month_number,1)+interval '1 month - 1 day')::date
 ),
 CONSTRAINT daily_monthly_days_correct CHECK (
  calendar_days=EXTRACT(DAY FROM last_draw_date)::integer
 )
);
CREATE INDEX IF NOT EXISTS idx_daily_monthly_draft_history
 ON public.campaign_daily_monthly_plan_drafts(campaign_id,year_number,month_number,revision DESC);
ALTER TABLE public.campaign_daily_monthly_plan_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_daily_monthly_plan_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.campaign_daily_monthly_plan_drafts TO service_role;
CREATE OR REPLACE FUNCTION public.reject_daily_monthly_plan_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
BEGIN
 RAISE EXCEPTION 'Los planes mensuales son inmutables: crear revisión nueva';
END;
$body$;
REVOKE ALL ON FUNCTION public.reject_daily_monthly_plan_mutation() FROM PUBLIC,anon,authenticated;
DO $install$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger
 WHERE tgrelid='public.campaign_daily_monthly_plan_drafts'::regclass
 AND tgname='trg_daily_monthly_draft_immutable' AND NOT tgisinternal) THEN
 CREATE TRIGGER trg_daily_monthly_draft_immutable BEFORE UPDATE OR DELETE
 ON public.campaign_daily_monthly_plan_drafts
 FOR EACH ROW EXECUTE FUNCTION public.reject_daily_monthly_plan_mutation();
 END IF;
END $install$;
CREATE OR REPLACE FUNCTION public.admin_daily_save_month_plan_draft(
 p_campaign_id uuid,p_year integer,p_month integer,p_kind text,
 p_description text,p_amount numeric,p_quantity integer,p_actor_fingerprint text)
RETURNS TABLE(draft_id uuid,revision_number integer,day_count integer,major_day date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_campaign public.rifas%ROWTYPE;
 v_revision integer;
 v_days integer;
 v_last date;
 v_id uuid;
 v_description text:=nullif(btrim(coalesce(p_description,'')),'');
BEGIN
 IF p_year IS NULL OR p_month IS NULL OR p_year NOT BETWEEN 2026 AND 2100
 OR p_month NOT BETWEEN 1 AND 12 OR p_actor_fingerprint IS NULL
 OR p_actor_fingerprint !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Mes o administrador de borrador inválidos';
 END IF;
 IF NOT(
  (p_kind IS NULL AND v_description IS NULL AND p_amount IS NULL AND p_quantity IS NULL)
  OR (p_kind='money' AND length(v_description) BETWEEN 12 AND 800
      AND p_amount>0 AND p_quantity IS NULL)
  OR (p_kind='physical' AND length(v_description) BETWEEN 12 AND 800
      AND p_amount IS NULL AND p_quantity>0)
 ) THEN
  RAISE EXCEPTION 'Se debe elegir un único premio mayor: dinero O especie, no ambos';
 END IF;
 SELECT * INTO v_campaign FROM public.rifas WHERE id=p_campaign_id FOR UPDATE;
 IF NOT FOUND OR v_campaign.draw_provider IS DISTINCT FROM 'loteria_sinuano_noche'
 OR v_campaign.draw_mode IS DISTINCT FROM 'loteria_4_pleno'
 OR v_campaign.status IS DISTINCT FROM 'pending'
 OR v_campaign.is_public IS DISTINCT FROM false
 OR NOT EXISTS(SELECT 1 FROM public.daily_draw_campaign_authorizations a
  WHERE a.campaign_id=p_campaign_id AND a.approval_status='pending'
   AND a.regulatory_clearance=false AND a.payment_provider_clearance=false)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_daily_commerce_controls g
  WHERE g.singleton=true AND g.sales_enabled=false)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_daily_documentary_controls d
  WHERE d.campaign_id=p_campaign_id
    AND d.regulatory_review_unlocked=false AND d.processor_review_unlocked=false)
 THEN RAISE EXCEPTION 'Solo se admiten borradores sin ventas ni permisos'; END IF;
 v_last:=(make_date(p_year,p_month,1)+interval '1 month - 1 day')::date;
 v_days:=EXTRACT(DAY FROM v_last)::integer;
 SELECT COALESCE(MAX(m.revision),0)+1 INTO v_revision
 FROM public.campaign_daily_monthly_plan_drafts m
 WHERE m.campaign_id=p_campaign_id AND m.year_number=p_year AND m.month_number=p_month;
 INSERT INTO public.campaign_daily_monthly_plan_drafts(
  campaign_id,year_number,month_number,revision,calendar_days,last_draw_date,
  major_prize_kind,major_prize_description,major_prize_amount,
  major_prize_quantity,actor_fingerprint)
 VALUES(p_campaign_id,p_year,p_month,v_revision,v_days,v_last,
  p_kind,v_description,p_amount,p_quantity,p_actor_fingerprint)
 RETURNING id INTO v_id;
 INSERT INTO public.campaign_daily_audit(
  campaign_id,event_kind,actor_fingerprint,details)
 VALUES(p_campaign_id,'monthly_draft_revision_added',p_actor_fingerprint,
  jsonb_build_object('draft_id',v_id,'year',p_year,'month',p_month,
   'revision',v_revision,'days',v_days,'major_day',v_last,'kind',p_kind,
   'approval','NOT_GRANTED'));
 RETURN QUERY SELECT v_id,v_revision,v_days,v_last;
END;
$body$;
REVOKE ALL ON FUNCTION public.admin_daily_save_month_plan_draft(uuid,integer,integer,text,text,numeric,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_save_month_plan_draft(uuid,integer,integer,text,text,numeric,integer,text)
 TO service_role;
