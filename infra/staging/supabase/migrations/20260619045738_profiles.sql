create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tier       text not null default 'free' references public.tiers(name),
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);