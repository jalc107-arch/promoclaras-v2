-- Verificación del teléfono de organizadores mediante OTP de WhatsApp.
-- Ejecutar una vez en Supabase > SQL Editor antes de desplegar esta versión.

create extension if not exists pgcrypto;

create table if not exists public.phone_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  purpose text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts >= 0 and attempts <= 5),
  consumed_at timestamptz,
  delivery_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists phone_verification_challenges_phone_idx
  on public.phone_verification_challenges (phone_e164, purpose, created_at desc);

create index if not exists phone_verification_challenges_expiry_idx
  on public.phone_verification_challenges (expires_at);

alter table public.phone_verification_challenges enable row level security;

comment on table public.phone_verification_challenges is
  'Desafíos OTP temporales. El código se conserva únicamente como HMAC y el acceso se realiza con service role.';

alter table public.organizers
  add column if not exists phone_verified_at timestamptz;
