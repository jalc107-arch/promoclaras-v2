-- PostgreSQL ephemeral GitHub Actions only. Extends test fixture with the
-- columns needed by the REAL result RPC, not mocked result calculations.
CREATE ROLE service_role NOLOGIN;
ALTER TABLE public.rifas ADD COLUMN status text DEFAULT 'pending';
ALTER TABLE public.rifas ADD COLUMN is_public boolean DEFAULT false;
ALTER TABLE public.tickets ADD COLUMN combination text NOT NULL DEFAULT '0000';
ALTER TABLE public.campaign_daily_ticket_activations ADD COLUMN payment_confirmation_at timestamptz;
ALTER TABLE public.campaign_daily_draws
 ADD COLUMN draw_date date,
 ADD COLUMN major_prize boolean DEFAULT false,
 ADD COLUMN prize_kind text,
 ADD COLUMN prize_amount numeric,
 ADD COLUMN prize_description text,
 ADD COLUMN official_result text,
 ADD COLUMN official_result_reference text,
 ADD COLUMN result_verified_at timestamptz,
 ADD COLUMN result_admin_fingerprint text,
 ADD COLUMN winner_ticket_id uuid,
 ADD COLUMN eligibility_digest text,
 ADD COLUMN eligible_ticket_count integer,
 ADD COLUMN outcome text;
CREATE TABLE public.daily_draw_campaign_authorizations (
 campaign_id uuid PRIMARY KEY REFERENCES public.rifas(id),
 approval_status text NOT NULL DEFAULT 'pending',
 regulatory_clearance boolean DEFAULT false,
 payment_provider_clearance boolean DEFAULT false,
 approved_at timestamptz,
 revoked_at timestamptz
);
CREATE TABLE public.campaign_daily_awards (
 draw_id uuid REFERENCES public.campaign_daily_draws(id),
 ticket_id uuid REFERENCES public.tickets(id),
 UNIQUE(draw_id,ticket_id)
);
CREATE TABLE public.campaign_daily_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 campaign_id uuid,
 draw_id uuid,
 event_kind text,
 actor_fingerprint text,
 details jsonb
);
