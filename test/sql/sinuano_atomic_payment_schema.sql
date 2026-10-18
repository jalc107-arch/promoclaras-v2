-- GitHub Actions isolated Postgres 17 only. Extends minimal fixture with
-- fields and UNIQUE constraints matching staging after confirmed real schema.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TABLE public.rifas ADD COLUMN price_per_ticket numeric NOT NULL DEFAULT 2500;
ALTER TABLE public.orders ADD COLUMN buyer_id uuid;
ALTER TABLE public.orders ADD COLUMN payment_mode text DEFAULT 'full';
ALTER TABLE public.orders ADD COLUMN amount_paid numeric DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN installment_id uuid;
ALTER TABLE public.tickets ADD COLUMN ticket_code text;
ALTER TABLE public.tickets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.tickets ADD COLUMN buyer_id uuid;
ALTER TABLE public.campaign_daily_ticket_activations ADD COLUMN revoked_reason text;
ALTER TABLE public.campaign_daily_ticket_activations ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE public.campaign_daily_ticket_activations ALTER COLUMN approved_payment_id SET NOT NULL;
ALTER TABLE public.campaign_daily_ticket_activations ALTER COLUMN payment_confirmation_at SET NOT NULL;
ALTER TABLE public.campaign_daily_ticket_activations ALTER COLUMN activated_at SET NOT NULL;
ALTER TABLE public.campaign_daily_ticket_activations ADD PRIMARY KEY(ticket_id);
ALTER TABLE public.tickets ADD CONSTRAINT test_unique_campaign_combination UNIQUE(rifa_id,combination);
ALTER TABLE public.tickets ADD CONSTRAINT test_unique_campaign_ticket_code UNIQUE(rifa_id,ticket_code);
