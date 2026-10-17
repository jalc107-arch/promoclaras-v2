-- STAGING ONLY. Never apply to CampaClick production or FuerzaMarket.
-- Requires existing daily_draw_campaign_authorizations and
-- daily_draw_authorization_events created on staging 2026-10-17.
-- No existing payments, campaign tables or order constraints are altered.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_daily_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
  draw_date date NOT NULL,
  provider text NOT NULL DEFAULT 'loteria_sinuano_noche' CHECK (provider = 'loteria_sinuano_noche'),
  draw_mode text NOT NULL DEFAULT 'loteria_4_pleno' CHECK (draw_mode = 'loteria_4_pleno'),
  prize_kind text NOT NULL DEFAULT 'undetermined' CHECK (prize_kind IN ('undetermined','money','physical')),
  prize_description text NOT NULL DEFAULT 'Premio por definir',
  prize_amount numeric(14,2),
  major_prize boolean NOT NULL DEFAULT false,
  cutoff_at timestamptz,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','result_pending','completed','cancelled')),
  official_result text CHECK (official_result IS NULL OR official_result ~ '^[0-9]{4}$'),
  official_result_reference text,
  result_verified_at timestamptz,
  result_admin_fingerprint text,
  winner_ticket_id uuid REFERENCES public.tickets(id) ON DELETE RESTRICT,
  eligibility_digest text,
  eligible_ticket_count integer,
  outcome text CHECK (outcome IS NULL OR outcome IN ('winner','no_winner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_campaign_daily_draw UNIQUE(campaign_id,draw_date),
  CONSTRAINT draw_cutoff_before_result CHECK (cutoff_at IS NULL OR scheduled_at IS NULL OR cutoff_at <= scheduled_at),
  CONSTRAINT draw_amount_valid CHECK (prize_amount IS NULL OR prize_amount > 0),
  CONSTRAINT no_winner_without_ticket CHECK (outcome <> 'no_winner' OR winner_ticket_id IS NULL),
  CONSTRAINT winner_requires_ticket CHECK (outcome <> 'winner' OR winner_ticket_id IS NOT NULL),
  CONSTRAINT complete_requires_official_result CHECK (status <> 'completed' OR
    (official_result IS NOT NULL AND official_result_reference IS NOT NULL
     AND result_verified_at IS NOT NULL AND outcome IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_draws_schedule
  ON public.campaign_daily_draws(campaign_id,draw_date);

CREATE TABLE IF NOT EXISTS public.campaign_daily_ticket_activations (
  ticket_id uuid PRIMARY KEY REFERENCES public.tickets(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  approved_payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  payment_confirmation_at timestamptz NOT NULL,
  activated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activation_after_payment CHECK (activated_at >= payment_confirmation_at),
  CONSTRAINT revocation_after_activation CHECK (revoked_at IS NULL OR revoked_at > activated_at)
);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_activations_campaign
  ON public.campaign_daily_ticket_activations(campaign_id,activated_at);

CREATE TABLE IF NOT EXISTS public.campaign_daily_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id uuid NOT NULL UNIQUE REFERENCES public.campaign_daily_draws(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  award_status text NOT NULL DEFAULT 'pending' CHECK (award_status IN ('pending','verified','delivered','revoked'))
);

CREATE TABLE IF NOT EXISTS public.campaign_daily_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.rifas(id) ON DELETE RESTRICT,
  draw_id uuid REFERENCES public.campaign_daily_draws(id) ON DELETE RESTRICT,
  event_kind text NOT NULL,
  actor_fingerprint text NOT NULL,
  event_time timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_campaign_daily_audit_timeline ON public.campaign_daily_audit(campaign_id,event_time DESC);

ALTER TABLE public.campaign_daily_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_daily_ticket_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_daily_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_daily_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_daily_draws, public.campaign_daily_ticket_activations,public.campaign_daily_awards,public.campaign_daily_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaign_daily_draws,public.campaign_daily_ticket_activations,public.campaign_daily_awards TO service_role;
GRANT SELECT,INSERT ON public.campaign_daily_audit TO service_role;

-- A single database transaction records the decision and appends audit.
-- service_role ONLY; Express verifies admin session and CSRF before calling.
CREATE OR REPLACE FUNCTION public.admin_daily_draw_decide_atomic(
  p_campaign_id uuid, p_decision text, p_reason text,
  p_actor_fingerprint text, p_reference text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
  current_row public.daily_draw_campaign_authorizations%ROWTYPE;
  campaign_provider text;
BEGIN
  IF p_decision NOT IN ('regulatory_checked','processor_checked','approved','revoked','rejected') THEN
    RAISE EXCEPTION 'Decisión no autorizada';
  END IF;
  IF length(trim(coalesce(p_reason,''))) < 15 OR length(p_reason) > 1500 THEN
    RAISE EXCEPTION 'Motivo insuficiente';
  END IF;
  IF p_actor_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Actor no validado';
  END IF;
  SELECT draw_provider INTO campaign_provider FROM public.rifas WHERE id=p_campaign_id FOR UPDATE;
  IF campaign_provider IS DISTINCT FROM 'loteria_sinuano_noche' THEN
    RAISE EXCEPTION 'Esta campaña no es una modalidad diaria excepcional';
  END IF;
  SELECT * INTO current_row FROM public.daily_draw_campaign_authorizations
   WHERE campaign_id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe expediente de autorización'; END IF;
  IF p_decision IN ('regulatory_checked','processor_checked') THEN
    IF current_row.approval_status <> 'pending' THEN RAISE EXCEPTION 'Expediente cerrado'; END IF;
    IF length(trim(coalesce(p_reference,''))) < 10 THEN RAISE EXCEPTION 'Falta referencia documental'; END IF;
    IF p_decision='regulatory_checked' THEN
      UPDATE public.daily_draw_campaign_authorizations SET regulatory_clearance=true,updated_at=now()
       WHERE campaign_id=p_campaign_id;
    ELSE
      UPDATE public.daily_draw_campaign_authorizations SET payment_provider_clearance=true,updated_at=now()
       WHERE campaign_id=p_campaign_id;
    END IF;
  ELSIF p_decision='approved' THEN
    IF current_row.approval_status <> 'pending' OR current_row.regulatory_clearance IS DISTINCT FROM true
       OR current_row.payment_provider_clearance IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'No se permite aprobar sin doble comprobación documental';
    END IF;
    UPDATE public.daily_draw_campaign_authorizations
     SET approval_status='approved', approval_reason=p_reason, admin_session_fingerprint=p_actor_fingerprint,
         approved_at=now(), revoked_at=NULL, updated_at=now()
     WHERE campaign_id=p_campaign_id;
  ELSIF p_decision='revoked' THEN
    IF current_row.approval_status <> 'approved' THEN RAISE EXCEPTION 'Solo se revoca autorización aprobada'; END IF;
    UPDATE public.daily_draw_campaign_authorizations SET approval_status='revoked',
      revoked_at=now(), updated_at=now(),approval_reason=p_reason
     WHERE campaign_id=p_campaign_id;
  ELSE
    IF current_row.approval_status <> 'pending' THEN RAISE EXCEPTION 'Solo se rechaza expediente pendiente'; END IF;
    UPDATE public.daily_draw_campaign_authorizations SET approval_status='rejected',
      approval_reason=p_reason,updated_at=now() WHERE campaign_id=p_campaign_id;
  END IF;
  INSERT INTO public.daily_draw_authorization_events
     (campaign_id,decision,operator_session_fingerprint,reason,details)
  VALUES (p_campaign_id,p_decision,p_actor_fingerprint,p_reason,
    jsonb_build_object('reference',coalesce(p_reference,'')));
  RETURN true;
END;
$body$;
REVOKE ALL ON FUNCTION public.admin_daily_draw_decide_atomic(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_draw_decide_atomic(uuid,text,text,text,text) TO service_role;
COMMIT;
