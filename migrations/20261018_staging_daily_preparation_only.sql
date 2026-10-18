-- SOLO STAGING. Preparación de una eventual modalidad autorizable.
-- Estos objetos NO aprueban campañas, NO habilitan cobros y NO publican sorteos.
CREATE TABLE IF NOT EXISTS public.campaign_daily_preflight_notes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
 requirement_key text NOT NULL CHECK(requirement_key IN(
  'legal_classification','competent_authority','regulatory_authorization',
  'wompi_written_approval','official_result_rights','prize_plan',
  'draw_schedule','unclaimed_prize_rule','taxes_guarantees',
  'privacy_antifraud','terms_and_consumer_rights')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 15 AND 1200),
 evidence_reference text CHECK(evidence_reference IS NULL OR length(evidence_reference)<=400),
 actor_fingerprint text NOT NULL CHECK(actor_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_daily_preflight_notes
 ON public.campaign_daily_preflight_notes(campaign_id,created_at DESC);
ALTER TABLE public.campaign_daily_preflight_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_daily_preflight_notes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.campaign_daily_preflight_notes TO service_role;

CREATE TABLE IF NOT EXISTS public.campaign_daily_prize_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
 draw_id uuid NOT NULL REFERENCES public.campaign_daily_draws(id) ON DELETE RESTRICT,
 draw_date date NOT NULL,
 option_label text NOT NULL CHECK(length(btrim(option_label)) BETWEEN 3 AND 70),
 prize_kind text NOT NULL CHECK(prize_kind IN('money','physical')),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 12 AND 800),
 proposed_amount numeric(14,2),
 quantity integer,
 proposal_status text NOT NULL DEFAULT 'draft' CHECK(proposal_status='draft'),
 legal_review_required boolean NOT NULL DEFAULT true CHECK(legal_review_required IS TRUE),
 actor_fingerprint text NOT NULL CHECK(actor_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT daily_proposal_amount CHECK(
   (prize_kind='money' AND proposed_amount>0 AND quantity IS NULL)
   OR (prize_kind='physical' AND proposed_amount IS NULL AND quantity>0)),
 CONSTRAINT daily_proposal_unique_label UNIQUE(draw_id,option_label)
);
CREATE INDEX IF NOT EXISTS idx_daily_prize_proposals
 ON public.campaign_daily_prize_proposals(campaign_id,draw_date);
ALTER TABLE public.campaign_daily_prize_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_daily_prize_proposals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.campaign_daily_prize_proposals TO service_role;

CREATE OR REPLACE FUNCTION public.reject_daily_draft_history_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
BEGIN
 RAISE EXCEPTION 'Las notas y propuestas históricas son inmutables: crear una versión nueva';
END;
$body$;
REVOKE ALL ON FUNCTION public.reject_daily_draft_history_mutation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_daily_preflight_notes_immutable ON public.campaign_daily_preflight_notes;
CREATE TRIGGER trg_daily_preflight_notes_immutable
 BEFORE UPDATE OR DELETE ON public.campaign_daily_preflight_notes
 FOR EACH ROW EXECUTE FUNCTION public.reject_daily_draft_history_mutation();
DROP TRIGGER IF EXISTS trg_daily_prize_proposals_immutable ON public.campaign_daily_prize_proposals;
CREATE TRIGGER trg_daily_prize_proposals_immutable
 BEFORE UPDATE OR DELETE ON public.campaign_daily_prize_proposals
 FOR EACH ROW EXECUTE FUNCTION public.reject_daily_draft_history_mutation();

CREATE OR REPLACE FUNCTION public.admin_daily_record_preflight_note(
 p_campaign_id uuid,p_requirement_key text,p_note text,
 p_reference text,p_actor_fingerprint text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE c public.rifas%ROWTYPE; note_id uuid;
BEGIN
 IF p_actor_fingerprint !~ '^[a-f0-9]{64}$' OR p_actor_fingerprint IS NULL
   OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 15 AND 1200
   OR length(coalesce(p_reference,''))>400 THEN
   RAISE EXCEPTION 'Registro administrativo inválido';
 END IF;
 SELECT * INTO c FROM public.rifas WHERE id=p_campaign_id FOR UPDATE;
 IF NOT FOUND OR c.draw_provider IS DISTINCT FROM 'loteria_sinuano_noche'
   OR c.draw_mode IS DISTINCT FROM 'loteria_4_pleno'
   OR c.status IS DISTINCT FROM 'pending'
   OR c.is_public IS DISTINCT FROM false
   OR NOT EXISTS(SELECT 1 FROM public.daily_draw_campaign_authorizations a
      WHERE a.campaign_id=c.id AND a.approval_status='pending')
   OR NOT EXISTS(SELECT 1 FROM public.campaign_daily_commerce_controls g
      WHERE g.singleton=true AND g.sales_enabled=false) THEN
   RAISE EXCEPTION 'Solo se documentan expedientes diarios privados, pendientes y sin ventas';
 END IF;
 INSERT INTO public.campaign_daily_preflight_notes(
  campaign_id,requirement_key,note,evidence_reference,actor_fingerprint)
 VALUES(c.id,p_requirement_key,btrim(p_note),nullif(btrim(coalesce(p_reference,'')),''),p_actor_fingerprint)
 RETURNING id INTO note_id;
 INSERT INTO public.campaign_daily_audit(campaign_id,event_kind,actor_fingerprint,details)
 VALUES(c.id,'preflight_note_added',p_actor_fingerprint,
   jsonb_build_object('note_id',note_id,'requirement',p_requirement_key,
     'verification_state','NOT_VERIFIED'));
 RETURN note_id;
END;
$body$;
REVOKE ALL ON FUNCTION public.admin_daily_record_preflight_note(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_record_preflight_note(uuid,text,text,text,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.admin_daily_add_prize_proposal(
 p_campaign_id uuid,p_draw_date date,p_option_label text,
 p_kind text,p_description text,p_proposed_amount numeric,
 p_quantity integer,p_actor_fingerprint text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE c public.rifas%ROWTYPE; d public.campaign_daily_draws%ROWTYPE; proposal_id uuid;
BEGIN
 IF p_actor_fingerprint IS NULL OR p_actor_fingerprint !~ '^[a-f0-9]{64}$'
   OR length(btrim(coalesce(p_option_label,''))) NOT BETWEEN 3 AND 70
   OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 12 AND 800
   OR p_kind NOT IN ('money','physical') OR p_kind IS NULL
   OR NOT ((p_kind='money' AND p_proposed_amount>0 AND p_quantity IS NULL)
      OR (p_kind='physical' AND p_proposed_amount IS NULL AND p_quantity>0)) THEN
   RAISE EXCEPTION 'Propuesta de premio inválida';
 END IF;
 SELECT * INTO c FROM public.rifas WHERE id=p_campaign_id FOR UPDATE;
 IF NOT FOUND OR c.draw_provider IS DISTINCT FROM 'loteria_sinuano_noche'
    OR c.draw_mode IS DISTINCT FROM 'loteria_4_pleno'
    OR c.status IS DISTINCT FROM 'pending' OR c.is_public IS DISTINCT FROM false
    OR NOT EXISTS(SELECT 1 FROM public.daily_draw_campaign_authorizations a
        WHERE a.campaign_id=c.id AND a.approval_status='pending')
    OR NOT EXISTS(SELECT 1 FROM public.campaign_daily_commerce_controls g
        WHERE g.singleton=true AND g.sales_enabled=false) THEN
   RAISE EXCEPTION 'La campaña debe continuar en borrador, privada y bloqueada';
 END IF;
 SELECT * INTO d FROM public.campaign_daily_draws
   WHERE campaign_id=c.id AND draw_date=p_draw_date FOR UPDATE;
 IF NOT FOUND OR d.status<>'draft' OR d.official_result IS NOT NULL
   OR d.outcome IS NOT NULL THEN
   RAISE EXCEPTION 'Solo se pueden proponer premios de jornadas en borrador';
 END IF;
 INSERT INTO public.campaign_daily_prize_proposals(
 campaign_id,draw_id,draw_date,option_label,prize_kind,
 description,proposed_amount,quantity,actor_fingerprint)
 VALUES(c.id,d.id,d.draw_date,btrim(p_option_label),p_kind,
 btrim(p_description),p_proposed_amount,p_quantity,p_actor_fingerprint)
 RETURNING id INTO proposal_id;
 INSERT INTO public.campaign_daily_audit(campaign_id,draw_id,event_kind,actor_fingerprint,details)
 VALUES(c.id,d.id,'draft_prize_proposal_added',p_actor_fingerprint,
   jsonb_build_object('proposal_id',proposal_id,'proposal_status','DRAFT_ONLY',
     'legal_review_required',true));
 RETURN proposal_id;
END;
$body$;
REVOKE ALL ON FUNCTION public.admin_daily_add_prize_proposal(uuid,date,text,text,text,numeric,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_add_prize_proposal(uuid,date,text,text,text,numeric,integer,text)
 TO service_role;

-- Two final-day choices are seeded only as DRAFT options; neither is selected.
INSERT INTO public.campaign_daily_prize_proposals(
 campaign_id,draw_id,draw_date,option_label,prize_kind,
 description,proposed_amount,quantity,actor_fingerprint)
SELECT d.campaign_id,d.id,d.draw_date,'Alternativa A — dinero','money',
 'Propuesta no aprobada: doce millones quinientos mil pesos COP',
 12500000,NULL,encode(sha256(convert_to('STAGING_DRAFT_SEED','UTF8')),'hex')
FROM public.campaign_daily_draws d JOIN public.rifas c ON c.id=d.campaign_id
WHERE c.slug='prueba-interna-sinuano-noche-2500-4-cifras'
 AND c.status='pending' AND c.is_public=false
 AND d.draw_date=DATE '2026-12-31' AND d.status='draft' AND d.major_prize=true
ON CONFLICT(draw_id,option_label) DO NOTHING;
INSERT INTO public.campaign_daily_prize_proposals(
 campaign_id,draw_id,draw_date,option_label,prize_kind,
 description,proposed_amount,quantity,actor_fingerprint)
SELECT d.campaign_id,d.id,d.draw_date,'Alternativa B — motocicletas','physical',
 'Propuesta no aprobada: dos motocicletas nuevas, especificaciones por definir',
 NULL,2,encode(sha256(convert_to('STAGING_DRAFT_SEED','UTF8')),'hex')
FROM public.campaign_daily_draws d JOIN public.rifas c ON c.id=d.campaign_id
WHERE c.slug='prueba-interna-sinuano-noche-2500-4-cifras'
 AND c.status='pending' AND c.is_public=false
 AND d.draw_date=DATE '2026-12-31' AND d.status='draft' AND d.major_prize=true
ON CONFLICT(draw_id,option_label) DO NOTHING;
