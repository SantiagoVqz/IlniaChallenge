# Feature Flags — Backend & Mobile Architecture Challenge

A lightweight React Native (Expo) app that **securely displays environment-specific
feature flags based on a user's account tier**. Everything runs **locally** — no cloud
resources are provisioned.

The core idea: *which flags a user can see is enforced server-side at the database layer
(Postgres Row-Level Security), not hidden in the UI.* The mobile client and API never
decide entitlements — they pass the user's identity through and the database returns only
the rows that identity is allowed to see.

---

## What it demonstrates (challenge deliverables)

| Deliverable | Where |
| --- | --- |
| Isolated **Staging** + **Production** environments, local | Two Supabase stacks (`infra/staging`, `infra/production`), distinct ports + signing keys |
| **DB schema**: user profiles + feature flags; premium/beta flags gated to qualified users | `infra/staging/supabase/migrations/*` |
| **DB-level security**; unauthorized reads/writes rejected at the DB | RLS policies in `…_rls_policies.sql` |
| **Local Vercel API route** serving config to the client | `api/flags.ts` via `scripts/dev-server.mjs` |
| App **cleanly toggles** its target stack per environment | `.env.staging` / `.env.production` + `start:*` scripts + in-app env badge |
| **Secure session** persisted across app restarts | `expo-secure-store` storage adapter (`lib/supabase.ts`) |
| **Working E2E UI test** of a critical flow | Maestro flows in `e2e/` |

---

## Quick start

A `Makefile` wraps every command below — run `make help` to list targets. The shortest
path from a clean checkout to a green E2E run, with **Docker running**:

```bash
make doctor          # confirms node / supabase / docker / java / maestro are installed
make install         # JS dependencies

make ios             # ONE-TIME: native build + install the app on the booted simulator
```

Then open **four terminals** and run one command in each (each stays running):

```bash
# terminal 1 — Supabase staging stack
make db-staging

# terminal 2 — local API (:3000)
make api-staging

# terminal 3 — Metro bundler with staging env; press i to open the sim
make app-staging

# terminal 4 — run the E2E UI test
make e2e
```

That's it. `make e2e` prints `✅ Flow Passed` for each flow. First run only:
`make db-staging` applies migrations + seed automatically; if you ever need to reset the
data, run `supabase db reset --workdir infra/staging`.

> **Why four terminals?** The DB, API, and Metro are long-running services, and Maestro
> drives the **already-installed** app on the simulator — it doesn't build or serve. The
> detailed, npm-equivalent steps are in [Running it](#running-it) below.

### Make targets

| Command | What it does |
| --- | --- |
| `make help` | List all targets |
| `make doctor` | Check required tools are installed |
| `make install` | `npm install` |
| `make ios` | One-time native build + install on the simulator |
| `make db-staging` / `make db-production` | Start a Supabase stack (`*-stop` to stop) |
| `make api-staging` / `make api-production` | Serve the local API (:3000 / :3001) |
| `make app-staging` / `make app-production` | Start Metro with the matching env |
| `make e2e` | Run both Maestro flows |
| `make e2e-free` / `make e2e-premium` | Run a single flow |
| `make health` | Curl the staging `/api/health` endpoint |
| `make lint` / `make format` | Lint + prettier (check / auto-fix) |

---

## Architecture & key decisions

### 1. Authorization = JWT pass-through + RLS as the real gate

```
┌─────────┐  signInWithPassword   ┌──────────────┐
│  Expo   │ ────────────────────► │ Supabase Auth │  issues a user JWT (ES256)
│  app    │ ◄──────── JWT ─────────│  (local)      │
└────┬────┘                        └──────────────┘
     │  GET /api/flags
     │  Authorization: Bearer <JWT>
     ▼
┌──────────────────┐  anon/publishable key + forwarded JWT   ┌────────────┐
│  api/flags.ts    │ ──────────────────────────────────────► │  Postgres  │
│  (Vercel-style)  │   (NEVER the service_role key)           │  + RLS     │
└──────────────────┘ ◄──────── only the rows RLS allows ──────└────────────┘
```

- The client authenticates with Supabase Auth and gets a user access token (JWT).
- It calls the API with `Authorization: Bearer <jwt>`.
- The function builds a **request-scoped Supabase client using the publishable (anon) key
  + the forwarded JWT** — *not* the service role. `auth.uid()` then resolves inside
  Postgres and **RLS decides what rows come back**.
- The `service_role` / `sb_secret_*` key is reserved for trusted seed/admin tasks only —
  **never** on the user-facing read path, never shipped to the client.

Why: this satisfies "unauthorized reads/writes rejected at the DB layer" with real
defense-in-depth. Putting tier logic only in the function would be security theater — a
bug there would leak data. With RLS, even a compromised function (holding only the anon
key + a user JWT) still can't read another user's rows.

The gating rule lives in two `security definer` helpers and one policy:
`feature_flags` row is visible **iff** `enabled` **AND** caller `status = 'active'`
**AND** `caller.tier_rank >= flag.min_tier_rank`. There are **no write policies**, so
INSERT/UPDATE/DELETE are denied by default for normal users.

### 2. Separate Supabase stacks per environment

Staging and production are two independent local stacks on different ports
(production = staging + 100), "treated like the cloud." Environment isolation is real:
each stack signs JWTs with its **own ES256 key**, so a token minted by staging
**fails verification on production** (proven in the verification section below).
Details: [`infra/README.md`](infra/README.md).

### 3. Local Node adapter instead of `vercel dev`

`vercel dev` insists on linking a Vercel **cloud project**, which violates the "no cloud
resources" constraint. The handlers are written against the genuine Vercel signature
(`export default (req, res)`) so they stay deploy-portable; `scripts/dev-server.mjs` just
serves them locally. Node runs the `.ts` handlers directly via native type stripping — no
build step.

---

## Prerequisites

- **Node 22+** (native TS stripping for the API handlers), **npm**
- **Supabase CLI** (`brew install supabase/tap/supabase`) + **Docker** running
- **Xcode + iOS Simulator** (for the app / E2E)
- For the E2E test: **Maestro** + a **Java runtime** — see [`e2e/README.md`](e2e/README.md)

```bash
npm install
```

> `.env.staging`, `.env.production`, and each stack's `signing_keys.json` are **gitignored**
> (they hold local secrets). The signing keys are generated per stack — see
> `infra/README.md` if you need to regenerate them.

---

## Running it

### Ports

| Stack | Supabase API | Studio | Local API (adapter) |
| --- | --- | --- | --- |
| staging | 54321 | 54323 | 3000 |
| production | 54421 | 54423 | 3001 |

### Boot a stack + its API

```bash
# Staging (terminal 1 + 2)
npm run db:staging                 # supabase start (staging)
supabase db reset --workdir infra/staging   # apply migrations + seed (first run)
npm run api:staging                # local API on :3000

# Production (separate terminals; runs simultaneously)
npm run db:production
supabase db reset --workdir infra/production
npm run api:production              # local API on :3001
```

Sanity check:

```bash
curl http://localhost:3000/api/health   # {"status":"ok","env":"staging", ...}
curl http://localhost:3001/api/health   # {"status":"ok","env":"production", ...}
```

### Run the app (env-injected)

```bash
npm run start:staging      # Metro with staging config; press i for iOS sim
# or
npm run start:production    # Metro with production config
```

The app shows an **env badge** (amber `STAGING` / red `PRODUCTION`) so it's always obvious
which backend is targeted. `EXPO_PUBLIC_*` vars are inlined at bundle time, so each
`start:*` script produces a build wired to the matching stack.

> Run the app via `start:staging` / `start:production`, **not** `npm run ios`'s Metro —
> the latter has no dotenv injection (`supabaseUrl is required`). Use `npm run ios` only
> for the one-off native rebuild that installs the app on the simulator.

### Demo users

All seeded with password `password123` (test fixtures, local only):

| Email | Tier | Status | Sees |
| --- | --- | --- | --- |
| `free@example.com` | free | active | `basic_search` |
| `premium@example.com` | premium | active | `basic_search`, `new_dashboard` |
| `beta@example.com` | beta | active | `basic_search`, `new_dashboard`, `ai_assistant` |
| `suspended@example.com` | free | **suspended** | *(nothing — status gate)* |

---

## E2E test (the required deliverable)

Maestro drives the real app on a simulator and asserts the UI reflects each account's
server-side entitlements. The critical flow logs in as a **free** user and asserts the
premium flag is **absent** — an absence enforced by RLS, so the one assertion exercises
auth → JWT → API → RLS → render.

```bash
maestro test e2e/                 # runs both flows
# or individually:
maestro test e2e/login_free_user.yaml
maestro test e2e/login_premium_user.yaml
```

Full setup (Maestro + Java install, prereqs): [`e2e/README.md`](e2e/README.md).

---

## One-shot demo script (for a reviewer)

From a clean checkout, with Docker running:

```bash
npm install

# 1. Staging backend
npm run db:staging
supabase db reset --workdir infra/staging
npm run api:staging &                       # :3000

# 2. Production backend (proves the env split)
npm run db:production
supabase db reset --workdir infra/production
npm run api:production &                     # :3001

# 3. Prove DB-layer security from the shell (no app needed)
curl -s localhost:3000/api/health           # env: staging
curl -s localhost:3001/api/health           # env: production
#   (see "Verifying the security model" below for the per-tier JWT checks)

# 4. Launch the app against staging and log in as premium vs free
npm run start:staging                        # press i; badge shows amber STAGING

# 5. Run the E2E UI test
maestro test e2e/
```

### Verifying the security model (shell)

```bash
KEY=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env.staging | cut -d= -f2-)
TOKEN=$(curl -s "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"free@example.com","password":"password123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s localhost:3000/api/flags -H "Authorization: Bearer $TOKEN"   # only free-tier flags
curl -s localhost:3000/api/flags                                      # 401 (no token)
curl -s localhost:3001/api/flags -H "Authorization: Bearer $TOKEN"   # 401: staging JWT
                                                                      #   rejected by production
```

The last line is the environment-isolation proof: a staging-minted JWT fails on the
production stack because each stack uses its own ES256 signing key.

---

## Project layout

```
App.tsx                    # conditional render: loading -> spinner / session -> Flags / else Login
components/EnvBadge.tsx     # STAGING/PRODUCTION badge from EXPO_PUBLIC_APP_ENV
lib/
  supabase.ts              # supabase-js auth client (SecureStore storage adapter)
  useAuth.ts               # session hook (restore on launch + onAuthStateChange)
screens/
  LoginScreen.tsx          # email/password -> Supabase Auth
  FlagsScreen.tsx          # GET /api/flags w/ Bearer JWT -> renders entitlements
api/
  health.ts                # GET /api/health — reports env + supabase URL
  flags.ts                 # GET /api/flags — JWT pass-through -> RLS-gated flags
scripts/dev-server.mjs     # local-only adapter that serves api/*.ts offline
infra/
  README.md                # how the two stacks + env isolation work
  staging/supabase/        # migrations, seed.sql, config.toml, signing_keys.json (gitignored)
  production/supabase/      # config.toml; migrations/ + seed.sql are symlinks -> staging
e2e/                       # Maestro flows + README
```

---

## Notes & trade-offs

- **Single feature-flag set across both stacks.** `seed.sql` is symlinked staging →
  production, so both stacks carry the same flags. The env split is made visible by the
  in-app badge + the distinct API/Supabase URLs (and the JWT-isolation proof), which keeps
  the prototype simple. Diverging the data per env would mean a per-stack seed file — a
  deliberate non-goal here.
- **Reproducibility:** `supabase db reset --workdir infra/<stack>` rebuilds each database
  from migrations + seed, so the demo reproduces from scratch.
- The security rationale above and [`infra/README.md`](infra/README.md) cover the "why"
  behind the JWT-pass-through + RLS model and the per-stack signing-key isolation.
```
