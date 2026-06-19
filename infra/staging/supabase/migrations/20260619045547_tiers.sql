create table public.tiers (
  name text primary key,
  rank integer not null unique
);

comment on table public.tiers is
  'Ordered account tiers. Higher rank = more access. Gating compares ranks, not names.';