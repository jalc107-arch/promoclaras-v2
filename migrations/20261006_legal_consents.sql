-- Evidencia consultable de autorizaciones y aceptación de documentos legales.
-- Ejecutar una vez en Supabase > SQL Editor antes de desplegar esta versión.

create extension if not exists pgcrypto;

create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id text,
  order_id text,
  source text not null,
  terms_version text not null,
  privacy_version text not null,
  campaign_policy_version text,
  purposes text[] not null default '{}',
  request_ip text,
  user_agent text,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists legal_consents_actor_idx
  on public.legal_consents (actor_type, actor_id, accepted_at desc);

create index if not exists legal_consents_order_idx
  on public.legal_consents (order_id, accepted_at desc);

alter table public.legal_consents enable row level security;

comment on table public.legal_consents is
  'Evidencia de autorizaciones y aceptación de versiones legales. Acceso exclusivo mediante service role.';

alter table public.rifas
  add column if not exists regulatory_authority text,
  add column if not exists regulatory_authorization_number text,
  add column if not exists regulatory_authorization_date date,
  add column if not exists regulatory_authorization_url text;
