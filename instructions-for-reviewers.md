# Instructions for Reviewers

[![E2E](https://github.com/SantiagoVqz/IlniaChallenge/actions/workflows/e2e.yml/badge.svg)](https://github.com/SantiagoVqz/IlniaChallenge/actions/workflows/e2e.yml)

This doc is the fast path for evaluating the challenge: **how to run everything, how to
verify it works, and *why* each non-obvious decision was made.** It assumes nothing beyond
a clean checkout and Docker running. The root `README.md` has the full architecture write-up;
this is the operator's guide plus a decision log.

> **Don't want to run anything?** CI does the most important part. Every push runs the
> **DB-layer security assertions** on GitHub Actions — both Supabase stacks + APIs, per-tier
> RLS gating, the 401, and the cross-environment JWT rejection. Click the badge above (or the
> **Actions** tab) to see it green. The Maestro UI E2E runs locally (§4) — see
> [§7 CI](#7-ci--run-free-verification) for why it's not in CI.

---

## 0. What you're verifying

A React Native (Expo) app that securely displays environment-specific feature flags based
on a user's account tier — **entirely locally, no cloud**. The security claim to validate:
*which flags a user sees is enforced server-side at the Postgres layer (RLS), not in the UI.*

Four deliverables to confirm:

1. Isolated **staging** + **production** environments, local.
2. **DB schema** (profiles + feature flags) with premium/beta flags gated to qualified users.
3. **DB-level security** — unauthorized reads rejected at the database, served via a local Vercel-style API.
4. A **working E2E UI test** of the critical login → fetch flags → UI-reflects-entitlements flow.

---

## 1. Prerequisites

- **Node 22+** (the API handlers run as `.ts` via Node's native type stripping — no build step)
- **Supabase CLI** (`brew install supabase/tap/supabase`) + **Docker running**
- **Xcode + iOS Simulator** (for the app and the E2E run)
- **Maestro** + a **Java 17 runtime** for the E2E test (`e2e/README.md` has the install)

Run `make doctor` to check all of the above in one shot:

```bash
make doctor
# node / npm / supabase / docker / java / maestro -> version or MISSING
```

> `.env.staging`, `.env.production`, and each stack's `signing_keys.json` are **gitignored**
> (local secrets). Bootstrap the env files in one shot with **`make create-env`**, which
> copies the committed `config.env.staging` / `config.env.production` templates into place.
> Those templates carry the static local Supabase defaults but **omit** the
> `SUPABASE_SERVICE_ROLE_KEY` (GitHub blocks the `sb_secret_*` pattern, and it's unused on
> the read path — see **D1**); copy it from `supabase status` only if you need admin/seed
> access. For `signing_keys.json`, see `infra/README.md`.

---

## 2. Quick start (the Makefile path)

A `Makefile` wraps every npm incantation so you don't have to memorize the dotenv/port flags.
Run `make help` to list all targets. From a clean checkout, with Docker up:

```bash
make doctor          # confirm tools are installed
make install         # JS dependencies
make ios             # ONE-TIME: native build + install the app on the booted simulator
```

Then open **four terminals**, one long-running command each:

```bash
make db-staging      # terminal 1 — Supabase staging stack (applies migrations + seed on first run)
make api-staging     # terminal 2 — local API on :3000
make app-staging     # terminal 3 — Metro with staging env; press i to open the sim
make e2e             # terminal 4 — run both Maestro flows
```

`make e2e` prints `✅ Flow Passed` for each flow. To reset the database to a clean seeded
state at any point: `supabase db reset --workdir infra/staging`.

> **Why four terminals?** The DB, the API, and Metro are long-running services. Maestro
> drives the **already-installed** binary on the simulator — it does not build or serve.
> See decision **D5** below.

### All make targets

| Command | What it does |
| --- | --- |
| `make help` | List all targets |
| `make doctor` | Check required tools are installed |
| `make install` | `npm install` |
| `make create-env` | Generate `.env.staging` + `.env.production` from the committed `config.env.*` templates |
| `make ios` | One-time native build + install on the simulator |
| `make db-staging` / `make db-production` | Start a Supabase stack (`*-stop` to stop) |
| `make api-staging` / `make api-production` | Serve the local API (:3000 / :3001) |
| `make app-staging` / `make app-production` | Start Metro with the matching env |
| `make e2e` | Run both Maestro flows |
| `make e2e-free` / `make e2e-premium` | Run a single flow |
| `make health` | Curl the staging `/api/health` endpoint |
| `make lint` / `make format` | Lint + prettier (check / auto-fix) |

### Ports

| Stack | Supabase API | Studio | Local API (adapter) |
| --- | --- | --- | --- |
| staging | 54321 | 54323 | 3000 |
| production | 54421 | 54423 | 3001 |

Production's ports are staging **+100** and its `project_id` differs, so both stacks run
**simultaneously** in separate Docker namespaces.

---

## 3. Verifying the security model (no app needed)

This is the most important review step and it can be done entirely from the shell — it
proves entitlements are enforced at the **database**, not the client.

First, bring up both backends (proves the env split too):

```bash
make db-staging   && make api-staging       # :3000
make db-production && make api-production    # :3001  (separate terminals)

curl -s localhost:3000/api/health           # {"env":"staging", ...}
curl -s localhost:3001/api/health           # {"env":"production", ...}
```

Then mint a real user JWT against staging and hit the flags endpoint:

```bash
KEY=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env.staging | cut -d= -f2-)
TOKEN=$(curl -s "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"email":"free@example.com","password":"password123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s localhost:3000/api/flags -H "Authorization: Bearer $TOKEN"   # only free-tier flags
curl -s localhost:3000/api/flags                                      # 401 — no token
curl -s localhost:3001/api/flags -H "Authorization: Bearer $TOKEN"   # 401 — staging JWT
                                                                      #   rejected by production
```

What each line proves:

- **Free user sees only free-tier flags** → RLS filters rows by tier rank; the API never decides.
- **No token → 401** → the read path requires identity; nothing is public.
- **Staging JWT fails on production** → the environments are cryptographically isolated (see **D2**).

Swap the email to `premium@example.com` / `beta@example.com` to watch the visible flag set
widen, and `suspended@example.com` to watch it collapse to **nothing** (the status gate).

### Demo users (all password `password123`, local fixtures only)

| Email | Tier | Status | Sees |
| --- | --- | --- | --- |
| `free@example.com` | free | active | `basic_search` |
| `premium@example.com` | premium | active | `basic_search`, `new_dashboard` |
| `beta@example.com` | beta | active | `basic_search`, `new_dashboard`, `ai_assistant` |
| `suspended@example.com` | free | **suspended** | *(nothing — status gate)* |

---

## 4. The E2E test (required deliverable)

Maestro drives the real app on the simulator and asserts the UI matches each account's
server-side entitlements. The critical flow logs in as a **free** user and asserts the
premium flag is **absent** — and that absence is enforced by RLS, so the single assertion
exercises the whole chain: auth → JWT → API pass-through → RLS → render.

```bash
make e2e            # both flows
make e2e-free       # critical flow: free user, premium flag must be absent
make e2e-premium    # premium user sees both the free and premium flags
```

Prereqs: staging DB + API up, the app installed via `make ios`, and Metro serving staging
(`make app-staging`). Full Maestro/Java setup: `e2e/README.md`.

---

## 5. Decision log — "I did X because Y"

The choices below are the ones a reviewer is most likely to question, so here's the
reasoning explicitly.

### D1 — I enforce authorization with JWT pass-through + RLS, not in the API function

The API function (`api/flags.ts`) builds a **request-scoped Supabase client with the
publishable (anon) key plus the user's forwarded JWT** — never the `service_role` key.
`auth.uid()` then resolves inside Postgres and **RLS decides which rows come back**.

**Why:** the challenge requires "unauthorized reads/writes rejected at the DB layer." If I
put tier logic only in the function, that's security theater — one bug in the function
leaks data. With RLS as the gate, even a fully compromised function (holding only the anon
key and a user JWT) still cannot read another user's rows. The `service_role` /
`sb_secret_*` key never touches the user-facing read path and is never shipped to the
client; it's reserved for trusted seed/admin tasks. There are also **no write policies**, so
INSERT/UPDATE/DELETE are denied by default.

### D2 — Staging and production share identical API keys but use different signing keys

You'll notice `.env.staging` and `.env.production` carry the **same** `sb_publishable_*` /
`sb_secret_*` values. That looks wrong at first glance, but it's expected and **not** the
isolation boundary.

**Why they're identical:** both stacks are spun up from the **Supabase CLI**, and the CLI
uses the same static, well-known local default API keys for *every* local project. There's
no way to make the CLI mint different publishable/secret keys per stack — they're baked-in
local defaults shared across all CLI instances.

**Where the real isolation comes from:** each stack generates and signs its JWTs with its
**own ES256 signing key** (`signing_keys.json`, per stack, gitignored). So a token minted by
staging **fails signature verification on production** — proven by the last curl in §3. The
API keys are just transport credentials for the local gateway; the signing key is the actual
trust boundary between environments. I leaned on the signing keys precisely *because* the CLI
won't let the API keys differ.

### D3 — Two separate Supabase stacks, not one stack with swapped config

Staging and production are independent local stacks on different ports (production = staging
+ 100) with different `project_id`s, so they run at the same time in separate Docker
namespaces.

**Why:** the challenge asks to "treat it like the cloud" with distinct staging/production
workflows. One stack with swapped env vars would share a single database and a single
signing key — there'd be nothing to actually isolate, and the cross-environment-rejection
proof in §3 would be impossible. Two real stacks make the env split demonstrable.

### D4 — A local Node adapter instead of `vercel dev`

The handlers in `api/*.ts` are served locally by `scripts/dev-server.mjs`, a thin
zero-dependency Node HTTP adapter — **not** `vercel dev`.

**Why:** `vercel dev` insists on linking a Vercel **cloud project** to run, which directly
violates the "no cloud resources" / code-only constraint. I still wrote the handlers against
the genuine Vercel signature (`export default (req, res)`), so they stay byte-for-byte
portable to a real `vercel dev` or a deployment with zero code changes — the adapter only
replaces the *runner*, not the handler contract. Node runs the `.ts` files directly via
native type stripping, so there's no build step either.

### D5 — Maestro drives the installed binary; hence the four-terminal setup

Maestro tests the app that's already installed on the simulator — it does not build or bundle.

**Why the workflow looks the way it does:** you install once with `make ios`, keep Metro
serving the right env (`make app-staging`), and only then run `make e2e`. The DB, API, and
Metro are genuinely long-running services, so they each get a terminal. This isn't
incidental complexity — it mirrors how a real device-farm E2E run is structured (built
artifact + running backend + UI driver).

### D6 — One shared feature-flag set across both stacks

`seed.sql` is symlinked staging → production, so both stacks carry the same flags and users.

**Why:** the env split is already made visible three other ways — the in-app env badge, the
distinct API/Supabase URLs, and the JWT-isolation proof. Diverging the *data* per
environment would add a second seed file to maintain for no demonstrative gain on a
prototype. It's a deliberate non-goal, not an oversight. `supabase db reset --workdir
infra/<stack>` rebuilds either database from migrations + seed, so the whole demo reproduces
from scratch.

---

## 6. Where to look in the code

| Concern | File |
| --- | --- |
| JWT pass-through + RLS-gated read | `api/flags.ts` |
| Local Vercel-style adapter | `scripts/dev-server.mjs` |
| RLS policies + tier-rank gating | `infra/staging/supabase/migrations/*_rls_policies.sql` |
| Schema (profiles / feature_flags / tiers) | `infra/staging/supabase/migrations/*` |
| Seed data (users, tiers, flags) | `infra/staging/supabase/seed.sql` |
| Secure session persistence | `lib/supabase.ts` (SecureStore adapter), `lib/useAuth.ts` |
| Env toggling + badge | `.env.*`, `package.json` `start:*`, `components/EnvBadge.tsx` |
| E2E flows | `e2e/login_free_user.yaml`, `e2e/login_premium_user.yaml` |
| How the two stacks isolate | `infra/README.md` |

---

## 7. CI — run-free verification

`.github/workflows/e2e.yml` reproduces the backend security model on GitHub Actions, so the
core claim can be confirmed straight from the **Actions** tab without cloning. One job:

| Job | What it proves | Roughly |
| --- | --- | --- |
| **backend-security** | Boots **both** Supabase stacks + both APIs, then runs `scripts/ci/verify-security.sh`: per-tier RLS gating (free/premium/suspended), 401 without a token, and a staging JWT rejected by production. | ~3–5 min |

The workflow is **fully self-contained — no repo secrets to configure:**

- **Signing keys** (`signing_keys.json`, gitignored) are regenerated per stack by
  `scripts/gen-signing-key.mjs`. Generating a *distinct* ES256 key per stack is what makes
  the cross-environment rejection real — see decision **D2**.
- **`.env.*`** (gitignored) are rebuilt in-workflow from each stack's live
  `supabase status`, so they never depend on hardcoded keys.

You can run the exact security checks CI runs, locally: with both stacks + APIs up,
`bash scripts/ci/verify-security.sh`.

### Why the Maestro UI E2E is *not* in CI

It needs the **Dockerized Supabase stack and a device emulator in the same job**. GitHub's
macOS runners (required for the iOS Simulator) can't run Docker, and the Android-emulator
alternative on Ubuntu was slow and flaky (~15–25 min, KVM-dependent). The DB-layer guarantees
— the actual security claim — are already proven headlessly by **backend-security** above, so
the emulator job was removed to keep CI fast and reliable. The Maestro flows still run
locally against the iOS Simulator (§4, `e2e/README.md`).

### Why the Supabase CLI is pinned (not `latest`)

The CLI version pins the Supabase Docker image set. `latest` (then v2.107.0) pulled a newer
Postgres image that **dropped the blanket default privileges** older images granted to the
`authenticated` role on new `public` tables — so the security check failed with
`42501 permission denied for table feature_flags`. CI pins **2.95.4** to match the
locally-validated stack. The durable fix (so the pin can be dropped) is to `GRANT SELECT ON
public.feature_flags TO authenticated` explicitly in a migration rather than relying on the
image's implicit defaults.
