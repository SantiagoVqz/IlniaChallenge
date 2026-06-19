-- Seed data lives here (populated in Phase 1).
-- Shared across staging and production via symlink:
--   infra/production/supabase/seed.sql -> ../../staging/supabase/seed.sql
-- Tiers (ranked)
insert into public.tiers (name, rank) values
  ('free', 10), ('premium', 20), ('beta', 30);

-- Flags spanning min_tier + an explicitly-disabled one
insert into public.feature_flags (key, name, description, enabled, min_tier) values
  ('basic_search',   'Basic Search',   'Available to everyone',      true,  'free'),
  ('new_dashboard',  'New Dashboard',  'Premium and up',             true,  'premium'),
  ('ai_assistant',   'AI Assistant',   'Beta-tier only',             true,  'beta'),
  ('legacy_export',  'Legacy Export',  'Globally disabled flag',     false, 'free');

-- Seed users (email/password). Trigger auto-creates their profiles at tier 'free'.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'free@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'premium@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'beta@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'suspended@example.com',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- GoTrue scans these token columns as non-null Go strings; a direct INSERT leaves
-- them NULL, which 500s every password login ("converting NULL to string is
-- unsupported"). Backfill them to empty strings for the seeded users.
update auth.users set
  confirmation_token         = '',
  recovery_token             = '',
  email_change               = '',
  email_change_token_new     = '',
  email_change_token_current = '',
  phone_change               = '',
  phone_change_token         = '',
  reauthentication_token     = ''
where email like '%@example.com';

-- Identities are required for email/password login on current Supabase Auth.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, created_at, updated_at
) values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"free@example.com"}', 'email', now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"premium@example.com"}', 'email', now(), now()),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   '{"sub":"33333333-3333-3333-3333-333333333333","email":"beta@example.com"}', 'email', now(), now()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444',
   '{"sub":"44444444-4444-4444-4444-444444444444","email":"suspended@example.com"}', 'email', now(), now());

-- Promote profiles above the default 'free' / set status (rows already exist via trigger)
update public.profiles set tier = 'premium' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set tier = 'beta'    where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set status = 'suspended' where id = '44444444-4444-4444-4444-444444444444';