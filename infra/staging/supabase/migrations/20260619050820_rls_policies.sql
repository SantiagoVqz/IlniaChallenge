-- Name → rank. Definer + empty search_path mirrors handle_new_user hardening.
create function public.tier_rank(tier_name text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select rank from public.tiers where name = tier_name;
$$;

-- Caller's EFFECTIVE rank: their tier's rank if active, else NULL.
-- NULL is what enforces "suspended sees zero flags".
create function public.caller_active_tier_rank()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select t.rank
  from public.profiles p
  join public.tiers t on t.name = p.tier
  where p.id = (select auth.uid())
    and p.status = 'active';
$$;

-- Explicitly revoking public execution and granting it to authenticated only. 
revoke execute on function public.tier_rank(text)            from public, anon;
revoke execute on function public.caller_active_tier_rank()  from public, anon;
grant  execute on function public.tier_rank(text)            to authenticated;
grant  execute on function public.caller_active_tier_rank()  to authenticated;

-- Enable RLS for each table
alter table public.tiers          enable row level security;
alter table public.profiles       enable row level security;
alter table public.feature_flags  enable row level security;

-- Setting RLS policies for profiles
create policy "profiles: read own row"
on public.profiles
for select
to authenticated
using ( (select auth.uid()) = id );

-- Setting RLS policies for feature-flags
create policy "feature_flags: read entitled rows"
on public.feature_flags
for select
to authenticated
using (
  enabled
  and public.tier_rank(min_tier) <= public.caller_active_tier_rank()
);