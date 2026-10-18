-- PostgreSQL 17 ephemeral database only; does not touch Supabase.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.rifas(id uuid PRIMARY KEY,draw_provider text,draw_mode text);
CREATE TABLE public.daily_draw_campaign_authorizations(
 campaign_id uuid PRIMARY KEY REFERENCES public.rifas(id),
 approval_status text NOT NULL DEFAULT 'pending',
 regulatory_clearance boolean NOT NULL DEFAULT false,
 payment_provider_clearance boolean NOT NULL DEFAULT false
);
INSERT INTO public.rifas VALUES
 ('11111111-1111-4111-8111-111111111111','loteria_sinuano_noche','loteria_4_pleno'),
 ('22222222-2222-4222-8222-222222222222','loteria_boyaca','loteria_3_primeras');
INSERT INTO public.daily_draw_campaign_authorizations VALUES
 ('11111111-1111-4111-8111-111111111111','pending',false,false),
 ('22222222-2222-4222-8222-222222222222','pending',false,false);
