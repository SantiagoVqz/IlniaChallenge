# IlneaChallenge — Project Context

Lightweight prototype: a React Native (Expo) app that **securely displays
environment-specific feature flags based on a user's account status**. Everything
runs **locally** — no cloud resources are provisioned.

## Objective & constraints

- Show feature flags that differ by **environment** (staging vs production) and by the
  user's **account status / tier** (e.g. free vs premium/beta).
- "Securely" = which flags a user can see is enforced **server-side at the database
  layer**, not just hidden in the UI.
- **Code-only review.** No cloud provisioning. Runs fully locally via the Supabase CLI
  and Vercel-compatible functions.
- Required deliverable: an automated **E2E UI test** driving one critical flow
  (login → fetch flags → UI reflects the account's entitlements).

## Stack

- **Mobile:** React Native + Expo (Expo 54, RN 0.81, NativeWind, TypeScript).
- **API:** Vercel-style serverless functions (`api/*.ts`). Run locally via a thin
  zero-dependency adapter (see "API layer" below) — **not** `vercel dev`.
- **Backend:** Supabase local stack (Postgres + Auth + RLS) via the Supabase CLI.
- **E2E:** Maestro (`e2e/`, Phase 6 — done).

## Key architecture decisions

1. **Separate Supabase instances per environment** — staging and production are two
   independent local stacks on different ports, "treated like the cloud." Not one stack
   with swapped config. See `infra/README.md`.
2. **Authorization = JWT pass-through + RLS as the real gate.**
   - Client authenticates with Supabase Auth → gets a user access token (JWT).
   - Client calls the API function with `Authorization: Bearer <jwt>`.
   - The function builds a **request-scoped Supabase client using the anon/publishable
     key + the forwarded JWT** (NOT the service role). `auth.uid()` then resolves inside
     Postgres and **RLS decides what rows are returned**.
   - The `service_role` / `sb_secret_*` key is reserved for trusted admin/seed tasks
     only — never on the user-facing read path, never shipped to the client.
   - Rationale: satisfies "unauthorized reads/writes rejected at the DB layer" and gives
     defense-in-depth. Putting tier logic only in the function would be security theater.
3. **Local-only Node adapter instead of `vercel dev`** — `vercel dev` insists on linking
   a Vercel **cloud project**, which violates the "no cloud resources" constraint. The
   handlers are written against the genuine Vercel signature so they stay deploy-portable;
   `scripts/dev-server.mjs` just invokes them locally. (Node 24 runs the `.ts` handlers
   directly via native type stripping — no build step.)

## Directory layout

```
App.tsx, app.json, components/   # Expo app (root); App.tsx = conditional Login/Flags render
  components/EnvBadge.tsx        #   STAGING/PRODUCTION badge from EXPO_PUBLIC_APP_ENV
lib/                             # client-side app code
  supabase.ts                    #   supabase-js auth client (SecureStore storage adapter)
  useAuth.ts                     #   session hook (restore on launch + onAuthStateChange)
screens/                         # Expo screens (NativeWind; testIDs for Maestro)
  LoginScreen.tsx                #   email/password → Supabase Auth signInWithPassword
  FlagsScreen.tsx                #   GET /api/flags w/ Bearer JWT → renders entitlements
api/                             # Vercel-style serverless handlers
  health.ts                      #   GET /api/health — reports env + supabase URL
  flags.ts                       #   GET /api/flags — JWT pass-through → RLS-gated flags
scripts/dev-server.mjs           # local-only adapter that serves api/*.ts offline
README.md                        # root: setup, security model, demo script (Phase 7)
infra/
  README.md                      # how the two stacks + env isolation work (read this)
  staging/supabase/              # staging stack (project_id "IlneaChallenge")
    config.toml, migrations/, seed.sql, signing_keys.json (gitignored)
  production/supabase/            # production stack (project_id "IlneaChallenge_production")
    config.toml; migrations/ + seed.sql are SYMLINKS -> staging (shared schema)
e2e/                             # Maestro flows: login_free_user, login_premium_user (+ README)
.env.staging / .env.production   # env config (gitignored)
vercel.json                      # keeps handlers portable to real Vercel
```

## Environments & ports

| Stack      | Supabase API | Studio  | Local API (adapter) |
| ---------- | ------------ | ------- | ------------------- |
| staging    | 54321        | 54323   | 3000                |
| production | 54421        | 54423   | 3001                |

- Production's `config.toml` ports are staging's **+100**, and its `project_id` differs,
  so both stacks run **simultaneously** (separate Docker namespaces).
- **Env isolation comes from per-stack ES256 signing keys** (`signing_keys.json`): a JWT
  minted by staging fails verification on production. The `sb_publishable_*` /
  `sb_secret_*` API keys are static local defaults and are **identical** across both
  stacks — that's expected; the signing keys are the real boundary. Details in
  `infra/README.md`.

## Commands

```bash
# Supabase stacks (each in its own terminal; both can run at once)
npm run db:staging            # supabase start --workdir infra/staging
npm run db:production         # supabase start --workdir infra/production
npm run db:staging:stop
npm run db:production:stop

# Local API (Vercel-style handlers, offline)
npm run api:staging           # http://localhost:3000
npm run api:production        # http://localhost:3001

# Expo app (env injected via dotenv-cli)
npm run start:staging
npm run start:production

# Sanity check
curl http://localhost:3000/api/health   # -> {"env":"staging", ...}
```

After `supabase start`, paste each stack's keys into the matching `.env.*` if they change.

## Data model (decided)

- `profiles(id -> auth.users, tier, status)` — `tier` is account status (free/premium/beta);
  optional `status` (active/suspended).
- `feature_flags(id, key, name, description, enabled, min_tier)`.
- `tiers(name, rank)` lookup so tier comparison is an ordered numeric check (text ordering
  is unreliable). Gating rule: a user sees a flag when `user.tier_rank >= flag.min_tier_rank`.
- Chosen over a per-user entitlements join table for prototype simplicity.

## Gotchas

- **`expo-secure-store` fixed to `~15.0.8`** (was `^56.0.4`, wrong for Expo 54) via
  `npx expo install` — the secure session store. Done in Phase 4.
- **New native module ⇒ native rebuild, not just `start -c`.** The repo has a prebuilt
  `ios/` dir (managed-config, no `expo-dev-client`). Adding/version-fixing a native module
  (e.g. `expo-secure-store`) needs `npx expo prebuild --clean` + `npm run ios` (pod install +
  compile). `expo start -c` only clears the JS bundler cache → symptom: `Cannot find native
  module 'ExpoSecureStore'`.
- **Run the app via `npm run start:staging`, not the Metro from `npm run ios`.** `EXPO_PUBLIC_*`
  are inlined at bundle time; `run:ios` starts a plain Metro with no dotenv → `supabaseUrl is
  required` / undefined config. Use `run:ios` ONLY for the one-off native rebuild.
- **NativeWind: new dirs with `className` must be in `tailwind.config.js` `content` globs.**
  Tailwind only generates CSS for classes in scanned files; `screens/**` was missing → styles
  silently no-op'd (no borders/bg/padding). Glob now includes `App`, `components/**`,
  `screens/**`. Restart with `-c` after editing globs.
- `signing_keys.json` and `.env.*` are **gitignored** — never commit them.
- Handlers run under Node's native TS stripping; avoid TS features that aren't pure
  type-erasure (e.g. enums, namespaces, `parameter properties`) in `api/*.ts`.
- **Seeding `auth.users` directly: token string columns must be `''`, not `NULL`** —
  `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`,
  `email_change_token_current`, `phone_change`, `phone_change_token`,
  `reauthentication_token`. GoTrue scans them as non-null Go strings; a `NULL` 500s **every**
  login with `Database error querying schema`. `seed.sql` backfills these — keep that block.
- **The API reads `SUPABASE_PUBLISHABLE_KEY` (server var), never `SUPABASE_SERVICE_ROLE_KEY`.**
  After a fresh `supabase start`, if keys rotate, update `SUPABASE_PUBLISHABLE_KEY` in `.env.*`
  too. **Restart the API process after any `.env.*` change** — dotenv loads only at startup, so
  a running server won't see new/changed vars (a stale server → handler `500 "Server
  misconfigured"`).
- **Per-env client config is inlined at bundle time → `start:production` ≠ just a flag.**
  Switching envs needs a fresh `start:staging` / `start:production` (`-c`) and, on the running
  sim, a relaunch so the new bundle loads. The in-app **env badge** is the quick visual check
  that the right stack is targeted.
- **Maestro needs Java; install it via `brew install openjdk@17` (formula, NOT the cask).**
  The `temurin@17` cask runs a pkg installer that needs `sudo` (fails headless). The formula
  installs into the Homebrew prefix without sudo. Put `JAVA_HOME="$(brew --prefix openjdk@17)"`
  on PATH alongside `~/.maestro/bin`.
- **`expo-secure-store` session lives in the iOS keychain → survives Maestro `clearState`.**
  `clearState: true` only wipes the app-data container, not the keychain, so a flow can launch
  already-logged-in from a prior run. Every flow starts with a **conditional sign-out** to be
  hermetic. Also gate first interactions behind `extendedWaitUntil: visible: id: env-badge`
  (rides out the cold first-bundle build); `extendedWaitUntil` takes ONE condition (no `any:`).
- **Maestro runs the INSTALLED app binary — it doesn't build.** Install once with
  `npm run ios`, keep Metro serving the right env (`npm run start:staging`), then
  `maestro test e2e/`.

## Conventions

- Don't use the service role on any user-facing read/write path. RLS is the gate.
- Never trust tier/role/user-id sent from the client; derive identity from the JWT only.
- Keep `api/*.ts` as portable Vercel handlers (`export default (req, res)`).
