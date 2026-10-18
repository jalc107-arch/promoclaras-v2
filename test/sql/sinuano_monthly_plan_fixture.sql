-- Ephemeral DB with documentary guard already installed.
ALTER TABLE public.rifas ADD COLUMN status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.rifas ADD COLUMN is_public boolean NOT NULL DEFAULT false;
CREATE TABLE public.campaign_daily_commerce_controls (
 singleton boolean PRIMARY KEY, sales_enabled boolean NOT NULL);
INSERT INTO public.campaign_daily_commerce_controls VALUES(true,false);
CREATE TABLE public.campaign_daily_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid,
 event_kind text,actor_fingerprint text,details jsonb);
