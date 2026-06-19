create table public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- stable code identifier, e.g. 'new_dashboard'
  name        text not null,                 -- human label
  description text,
  enabled     boolean not null default true,
  min_tier    text not null default 'free' references public.tiers(name),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);