# Reviewer convenience wrappers around the npm scripts.
# `make help` lists everything. Most targets are thin aliases so reviewers
# don't have to memorise the dotenv/port incantations.

ENV ?= staging

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install JS dependencies
	npm install

.PHONY: doctor
doctor: ## Check that the tools reviewers need are installed
	@echo "node:     $$(node --version 2>/dev/null || echo MISSING)"
	@echo "npm:      $$(npm --version 2>/dev/null || echo MISSING)"
	@echo "supabase: $$(supabase --version 2>/dev/null || echo 'MISSING (npx supabase ...)')"
	@echo "docker:   $$(docker --version 2>/dev/null || echo 'MISSING (needed by supabase)')"
	@echo "java:     $$(java -version 2>&1 | head -n1 || echo 'MISSING (brew install openjdk@17)')"
	@echo "maestro:  $$(maestro --version 2>/dev/null || echo 'MISSING (curl -Ls https://get.maestro.mobile.dev | bash)')"

# --- Env bootstrap -------------------------------------------------------------

.PHONY: create-env-staging create-env-production create-env
create-env-staging: ## Generate .env.staging from config.env.staging
	@cp config.env.staging .env.staging
	@echo "Wrote .env.staging (from config.env.staging)"
create-env-production: ## Generate .env.production from config.env.production
	@cp config.env.production .env.production
	@echo "Wrote .env.production (from config.env.production)"
create-env: create-env-staging create-env-production ## Generate both .env files

# --- Backend stacks (Supabase) -------------------------------------------------

.PHONY: db-staging db-production db-staging-stop db-production-stop
db-staging: ## Start the staging Supabase stack (:54321)
	npm run db:staging
db-production: ## Start the production Supabase stack (:54421)
	npm run db:production
db-staging-stop: ## Stop the staging Supabase stack
	npm run db:staging:stop
db-production-stop: ## Stop the production Supabase stack
	npm run db:production:stop

# --- Local API (Vercel-style handlers) -----------------------------------------

.PHONY: api-staging api-production
api-staging: ## Serve the API with staging env (:3000)
	npm run api:staging
api-production: ## Serve the API with production env (:3001)
	npm run api:production

# --- Expo app bundler ----------------------------------------------------------

.PHONY: app-staging app-production
app-staging: ## Start Metro with staging env (press i to open the sim)
	npm run start:staging
app-production: ## Start Metro with production env
	npm run start:production

.PHONY: ios
ios: ## One-time native build + install onto the booted simulator
	npm run ios

# --- E2E (Maestro) -------------------------------------------------------------

.PHONY: e2e e2e-free e2e-premium
e2e: ## Run all Maestro flows against the installed app
	maestro test e2e/
e2e-free: ## Run only the free-user flow (the critical RLS gate)
	maestro test e2e/login_free_user.yaml
e2e-premium: ## Run only the premium-user flow
	maestro test e2e/login_premium_user.yaml

# --- Convenience: bring up the staging backend in the background ----------------

.PHONY: backend-staging
backend-staging: ## Start staging DB + API in the background (logs in ./.dev-logs)
	@mkdir -p .dev-logs
	npm run db:staging
	@echo "Starting API on :3000 (log: .dev-logs/api-staging.log)"
	@npm run api:staging > .dev-logs/api-staging.log 2>&1 &
	@sleep 2
	@curl -sf http://localhost:3000/api/health && echo "" || echo "API not ready yet — check .dev-logs/api-staging.log"

.PHONY: health
health: ## Curl the staging API health endpoint
	@curl -s http://localhost:3000/api/health && echo ""

# --- Quality -------------------------------------------------------------------

.PHONY: lint format
lint: ## Lint + prettier check
	npm run lint
format: ## Auto-fix lint + prettier
	npm run format
