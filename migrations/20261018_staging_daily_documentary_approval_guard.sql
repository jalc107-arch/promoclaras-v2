-- STAGING ONLY. An unverified document reference must NEVER set legal or
-- processor clearance; only an explicit externally reviewed database change
-- to the independent control could unlock the corresponding decision.
CREATE TABLE IF NOT EXISTS public.campaign_daily_documentary_controls (
 campaign_id uuid PRIMARY KEY REFERENCES public.rifas(id) ON DELETE RESTRICT,
 regulatory_review_unlocked boolean NOT NULL DEFAULT false,
 processor_review_unlocked boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 review_note text
);
INSERT INTO public.campaign_daily_documentary_controls(campaign_id)
 SELECT id FROM public.rifas WHERE draw_provider='loteria_sinuano_noche'
   AND draw_mode='loteria_4_pleno'
ON CONFLICT(campaign_id) DO NOTHING;
ALTER TABLE public.campaign_daily_documentary_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campaign_daily_documentary_controls
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_daily_documentary_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 provider_name text;
 mode_name text;
 reg_unlocked boolean:=false;
 processor_unlocked boolean:=false;
BEGIN
 SELECT r.draw_provider,r.draw_mode INTO provider_name,mode_name
 FROM public.rifas r WHERE r.id=NEW.campaign_id;
 IF provider_name IS DISTINCT FROM 'loteria_sinuano_noche'
 OR mode_name IS DISTINCT FROM 'loteria_4_pleno' THEN RETURN NEW; END IF;
 SELECT c.regulatory_review_unlocked,c.processor_review_unlocked
 INTO reg_unlocked,processor_unlocked
 FROM public.campaign_daily_documentary_controls c
 WHERE c.campaign_id=NEW.campaign_id;
 IF NEW.regulatory_clearance IS TRUE AND coalesce(reg_unlocked,false) IS NOT TRUE THEN
  RAISE EXCEPTION 'Documentación regulatoria no verificada externamente';
 END IF;
 IF NEW.payment_provider_clearance IS TRUE AND coalesce(processor_unlocked,false) IS NOT TRUE THEN
  RAISE EXCEPTION 'Autorización Wompi no verificada externamente';
 END IF;
 IF NEW.approval_status='approved' AND
 (coalesce(reg_unlocked,false) IS NOT TRUE OR coalesce(processor_unlocked,false) IS NOT TRUE) THEN
  RAISE EXCEPTION 'Expediente diario sin doble desbloqueo documental externo';
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_daily_documentary_approval()
 FROM PUBLIC,anon,authenticated;
DO $install$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_trigger WHERE tgrelid='public.daily_draw_campaign_authorizations'::regclass
   AND tgname='trg_daily_documentary_approval' AND NOT tgisinternal
 ) THEN
  CREATE TRIGGER trg_daily_documentary_approval
  BEFORE INSERT OR UPDATE ON public.daily_draw_campaign_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_daily_documentary_approval();
 END IF;
END;
$install$;
