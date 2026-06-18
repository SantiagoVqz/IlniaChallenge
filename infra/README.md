# Infra — local Supabase environments

Two independent local Supabase stacks, `staging` and `production`, each with its own
`supabase/` project directory. The `production` stack symlinks `migrations/` and `seed.sql`
back to `staging/` so schema and seed data stay in sync; only the runtime config differs.

| Stack        | API URL                  | Config                                   |
| ------------ | ------------------------ | ---------------------------------------- |
| `staging`    | `http://127.0.0.1:54321` | `staging/supabase/config.toml`           |
| `production` | `http://127.0.0.1:54421` | `production/supabase/config.toml`         |

## Environment isolation — how it actually works

Each stack signs user auth tokens (the JWTs issued on login) with its **own** ES256
signing key:

- `staging/supabase/signing_keys.json`
- `production/supabase/signing_keys.json`

Because the keys differ, a user access token minted by **staging fails signature
verification on production**, and vice versa — the same isolation you'd get from two
separate cloud projects. This is the meaningful "treat it like the cloud" boundary.

These files contain a private key (`d` in the JWK) and are **gitignored** — never commit
them. Each developer / environment generates its own:

```bash
supabase gen signing-key --algorithm ES256 --workdir <stack>/supabase \
  | python3 -c 'import sys,json;print(json.dumps([json.loads(sys.stdin.read())]))' \
  > <stack>/supabase/signing_keys.json
```

The path is wired in each `config.toml`:

```toml
[auth]
signing_keys_path = "./signing_keys.json"
```

## A note on the `sb_publishable_` / `sb_secret_` keys

The `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` values in `.env.*` use
the new Supabase API key format (`sb_publishable_…` / `sb_secret_…`). These are **static
local defaults** — identical for every local Supabase project and **not** derived from the
signing key. They are intentionally shared across both stacks; distinct API keys per
project is a cloud-only property that the local CLI does not reproduce. The per-stack
**signing keys** above are what provide environment isolation locally.

## Running a stack

Signing keys load at stack start, so restart after changing them:

```bash
(cd staging/supabase    && supabase stop && supabase start)
(cd production/supabase && supabase stop && supabase start)
```
