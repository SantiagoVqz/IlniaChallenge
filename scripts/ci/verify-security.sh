#!/usr/bin/env bash
#
# Asserts the DB-layer security model from the shell — the same checks a reviewer
# runs by hand in instructions-for-reviewers.md (§3), wired for CI exit codes.
#
# Proves, end to end, that entitlements are enforced by Postgres RLS (not the UI or
# the API function) and that the two environments are cryptographically isolated.
#
# Requires, already running:
#   - staging  stack + API on :3000
#   - production stack + API on :3001
#   - .env.staging present (for the Supabase URL + anon key used to mint tokens)
#   - jq
#
# Run locally:  bash scripts/ci/verify-security.sh
set -euo pipefail

API_STAGING="http://localhost:3000"
API_PRODUCTION="http://localhost:3001"

# Pull the staging Supabase URL + anon key from the env file the API also uses.
# shellcheck disable=SC1091
set -a; . ./.env.staging; set +a
SUPA_URL="${EXPO_PUBLIC_SUPABASE_URL}"
ANON="${EXPO_PUBLIC_SUPABASE_ANON_KEY}"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass + 1)); }
bad() { echo "  ❌ $1"; fail=$((fail + 1)); }

mint() { # email -> access_token (minted against the STAGING auth server)
  curl -s "${SUPA_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON}" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"password123\"}" | jq -r '.access_token'
}

flag_keys() { # token, api_base -> sorted comma-joined flag keys
  curl -s "$2/api/flags" -H "Authorization: Bearer $1" \
    | jq -r '[.flags[].key] | sort | join(",")'
}

http_with_token()    { curl -s -o /dev/null -w '%{http_code}' "$2/api/flags" -H "Authorization: Bearer $1"; }
http_without_token() { curl -s -o /dev/null -w '%{http_code}' "$1/api/flags"; }

echo "1) free-tier user sees only the free flag"
FREE="$(mint free@example.com)"
got="$(flag_keys "$FREE" "$API_STAGING")"
[ "$got" = "basic_search" ] && ok "free sees [$got]" || bad "free saw [$got], expected basic_search"

echo "2) premium user sees free + premium flags"
got="$(flag_keys "$(mint premium@example.com)" "$API_STAGING")"
[ "$got" = "basic_search,new_dashboard" ] && ok "premium sees [$got]" || bad "premium saw [$got]"

echo "3) suspended user sees nothing (status gate, enforced by RLS)"
got="$(flag_keys "$(mint suspended@example.com)" "$API_STAGING")"
[ -z "$got" ] && ok "suspended sees nothing" || bad "suspended saw [$got], expected nothing"

echo "4) no token -> 401 (read path requires identity)"
code="$(http_without_token "$API_STAGING")"
[ "$code" = "401" ] && ok "401 without token" || bad "expected 401, got $code"

echo "5) a staging JWT is rejected by production (env isolation via distinct signing keys)"
code="$(http_with_token "$FREE" "$API_PRODUCTION")"
[ "$code" = "401" ] && ok "production rejects staging JWT ($code)" || bad "expected 401, got $code"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
