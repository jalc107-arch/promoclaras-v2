-- Isolated GitHub Actions PostgreSQL service. No Supabase/Wompi credentials.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.rifas (
  id uuid PRIMARY KEY, draw_provider text, draw_mode text
);
CREATE TABLE public.campaign_daily_draws (
  id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES public.rifas(id),
  status text NOT NULL, cutoff_at timestamptz, scheduled_at timestamptz
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY, rifa_id uuid REFERENCES public.rifas(id),
  payment_status text, subtotal numeric, total_paid numeric, balance_due numeric,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY, order_id uuid REFERENCES public.orders(id),
  provider text, status text, provider_transaction_id text,
  amount numeric, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY, order_id uuid REFERENCES public.orders(id),
  rifa_id uuid REFERENCES public.rifas(id), status text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.campaign_daily_ticket_activations (
  ticket_id uuid REFERENCES public.tickets(id),
  campaign_id uuid REFERENCES public.rifas(id),
  order_id uuid REFERENCES public.orders(id),
  approved_payment_id uuid REFERENCES public.payments(id),
  activated_at timestamptz, revoked_at timestamptz
);
