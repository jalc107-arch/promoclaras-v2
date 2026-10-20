-- CampaClick Sinuano: private append-only DAILY prize proposals for a chosen month.
-- Never alters real draws, payments, orders, campaigns, commercial gates or approvals.
CREATE TABLE IF NOT EXISTS public.campaign_daily_day_prize_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
 monthly_plan_id uuid NOT NULL REFERENCES public.campaign_daily_monthly_plan_drafts(id) ON DELETE RESTRICT,
 draw_date date NOT NULL,
 revision integer NOT NULL CHECK(revision >= 1),
 request_id uuid NOT NULL,
 prize_kind text NOT NULL CHECK(prize_kind IN ('money','physical')),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 12 AND 800),
 cash_amount numeric(14,2),
 item_quantity integer,
 estimated_unit_cost numeric(14,2),
 actor_fingerprint text NOT NULL CHECK(actor_fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(campaign_id,draw_date,revision),
 UNIQUE(campaign_id,draw_date,request_id),
 CONSTRAINT daily_day_prize_exclusive CHECK (
   (prize_kind='money' AND cash_amount IS NOT NULL AND cash_amount>0
      AND item_quantity IS NULL AND estimated_unit_cost IS NULL)
   OR
   (prize_kind='physical' AND cash_amount IS NULL
      AND item_quantity IS NOT NULL AND item_quantity>0
      AND (estimated_unit_cost IS NULL OR estimated_unit_cost>=0))
 )
);
CREATE INDEX IF NOT EXISTS idx_daily_day_prize_history
 ON public.campaign_daily_day_prize_drafts(campaign_id,draw_date,revision DESC);
ALTER TABLE public.campaign_daily_day_prize_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_daily_day_prize_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.campaign_daily_day_prize_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.daily_draft_no_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $f$
BEGIN RAISE EXCEPTION 'Los borradores históricos no pueden editarse ni borrarse; cree otra revisión'; END $f$;
REVOKE ALL ON FUNCTION public.daily_draft_no_mutation() FROM PUBLIC,anon,authenticated;
DO $trg$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
  WHERE tgname='trg_daily_day_prize_immutable'
    AND tgrelid='public.campaign_daily_day_prize_drafts'::regclass AND NOT tgisinternal) THEN
 CREATE TRIGGER trg_daily_day_prize_immutable BEFORE UPDATE OR DELETE
 ON public.campaign_daily_day_prize_drafts
 FOR EACH ROW EXECUTE FUNCTION public.daily_draft_no_mutation();
 END IF;
END $trg$;

CREATE OR REPLACE FUNCTION public.admin_daily_save_day_prize_drafts(
 p_campaign_id uuid,p_monthly_plan_id uuid,p_start date,p_end date,
 p_kind text,p_description text,p_cash_amount numeric,p_quantity integer,
 p_estimated_unit_cost numeric,p_request_id uuid,p_actor_fingerprint text)
RETURNS TABLE(saved_days integer,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $f$
DECLARE c public.rifas%ROWTYPE;
        m public.campaign_daily_monthly_plan_drafts%ROWTYPE;
        total integer;prior integer;created integer;
BEGIN
 IF p_campaign_id IS NULL OR p_monthly_plan_id IS NULL OR p_start IS NULL OR
 p_end IS NULL OR p_request_id IS NULL OR p_actor_fingerprint IS NULL OR
 p_actor_fingerprint !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Identificadores del borrador incompletos';
 END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('money','physical') OR NOT COALESCE((
 (p_kind='money' AND coalesce(length(btrim(p_description)),0) BETWEEN 12 AND 800
  AND p_cash_amount IS NOT NULL AND p_cash_amount>0
  AND p_quantity IS NULL AND p_estimated_unit_cost IS NULL)
 OR
 (p_kind='physical' AND coalesce(length(btrim(p_description)),0) BETWEEN 12 AND 800
  AND p_cash_amount IS NULL AND p_quantity IS NOT NULL AND p_quantity>0
  AND (p_estimated_unit_cost IS NULL OR p_estimated_unit_cost>=0))
 ),false) THEN RAISE EXCEPTION 'Premio diario: dinero O especie, nunca ambos'; END IF;
 -- Lock a single campaign row first to serialize every overlapping date edit.
 SELECT * INTO c FROM public.rifas WHERE id=p_campaign_id FOR UPDATE;
 IF NOT FOUND OR c.draw_provider IS DISTINCT FROM 'loteria_sinuano_noche'
 OR c.draw_mode IS DISTINCT FROM 'loteria_4_pleno' OR c.status IS DISTINCT FROM 'pending'
 OR c.is_public IS DISTINCT FROM false
 OR NOT EXISTS(SELECT 1 FROM public.daily_draw_campaign_authorizations a
   WHERE a.campaign_id=p_campaign_id AND a.approval_status='pending'
   AND a.regulatory_clearance=false AND a.payment_provider_clearance=false)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_daily_commerce_controls g
   WHERE g.singleton=true AND g.sales_enabled=false)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_daily_documentary_controls d
   WHERE d.campaign_id=p_campaign_id AND d.regulatory_review_unlocked=false
   AND d.processor_review_unlocked=false) THEN
   RAISE EXCEPTION 'Solo se admiten borradores privados sin ventas ni permisos';
 END IF;
 SELECT * INTO m FROM public.campaign_daily_monthly_plan_drafts
  WHERE id=p_monthly_plan_id AND campaign_id=p_campaign_id FOR SHARE;
 IF NOT FOUND OR m.preparation_status<>'draft'
 OR m.revision<>(SELECT MAX(x.revision) FROM public.campaign_daily_monthly_plan_drafts x
    WHERE x.campaign_id=p_campaign_id AND x.year_number=m.year_number
    AND x.month_number=m.month_number) THEN
   RAISE EXCEPTION 'Debe usar el plan mensual más reciente';
 END IF;
 IF p_start<make_date(m.year_number,m.month_number,1)
 OR p_end>=m.last_draw_date OR p_start>p_end OR p_end-p_start+1>30 THEN
   RAISE EXCEPTION 'Fecha diaria fuera del mes o reservada al premio mayor';
 END IF;
 total:=p_end-p_start+1;
 SELECT count(*) INTO prior FROM public.campaign_daily_day_prize_drafts x
  WHERE x.campaign_id=p_campaign_id AND x.request_id=p_request_id;
 IF prior>0 THEN
  IF prior<>total OR EXISTS (
  SELECT 1 FROM public.campaign_daily_day_prize_drafts x
   WHERE x.campaign_id=p_campaign_id AND x.request_id=p_request_id
    AND (x.monthly_plan_id<>p_monthly_plan_id OR
         x.draw_date NOT BETWEEN p_start AND p_end OR x.prize_kind<>p_kind OR
         x.description<>btrim(p_description) OR
         x.cash_amount IS DISTINCT FROM p_cash_amount OR
         x.item_quantity IS DISTINCT FROM p_quantity OR
         x.estimated_unit_cost IS DISTINCT FROM p_estimated_unit_cost)
  ) THEN RAISE EXCEPTION 'Petición repetida con contenido diferente'; END IF;
  RETURN QUERY SELECT prior,true; RETURN;
 END IF;
 INSERT INTO public.campaign_daily_day_prize_drafts(
  campaign_id,monthly_plan_id,draw_date,revision,request_id,prize_kind,
  description,cash_amount,item_quantity,estimated_unit_cost,actor_fingerprint)
 SELECT p_campaign_id,p_monthly_plan_id,z.day::date,
   COALESCE((SELECT MAX(h.revision) FROM public.campaign_daily_day_prize_drafts h
    WHERE h.campaign_id=p_campaign_id AND h.draw_date=z.day::date),0)+1,
   p_request_id,p_kind,btrim(p_description),p_cash_amount,p_quantity,
   p_estimated_unit_cost,p_actor_fingerprint
 FROM generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') AS z(day);
 GET DIAGNOSTICS created=ROW_COUNT;
 IF created<>total THEN RAISE EXCEPTION 'Guardado incompleto de premios diarios'; END IF;
 INSERT INTO public.campaign_daily_audit(campaign_id,event_kind,actor_fingerprint,details)
 VALUES(p_campaign_id,'daily_draft_prizes_saved',p_actor_fingerprint,
   jsonb_build_object('month_plan_id',p_monthly_plan_id,'first',p_start,
    'last',p_end,'days',created,'kind',p_kind,'request_id',p_request_id,
    'status','DRAFT_NOT_AUTHORIZED'));
 RETURN QUERY SELECT created,false;
END $f$;
REVOKE ALL ON FUNCTION public.admin_daily_save_day_prize_drafts(
 uuid,uuid,date,date,text,text,numeric,integer,numeric,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_save_day_prize_drafts(
 uuid,uuid,date,date,text,text,numeric,integer,numeric,uuid,text) TO service_role;
