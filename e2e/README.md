# E2E tests (Maestro)

End-to-end UI tests that drive the real app on a simulator and assert the UI
reflects each account's **server-side** entitlements (RLS-gated feature flags).

## Flows

| File                     | Logs in as           | Asserts                                                        |
| ------------------------ | -------------------- | ------------------------------------------------------------- |
| `login_free_user.yaml`   | `free@example.com`   | `basic_search` visible, `new_dashboard` **absent** (the gate) |
| `login_premium_user.yaml`| `premium@example.com`| `basic_search` **and** `new_dashboard` both visible           |

`login_free_user.yaml` is the critical flow: the *absence* of the premium flag
is enforced by Postgres RLS, so this one assertion exercises the whole chain —
auth → JWT → API pass-through → RLS → render.

## Prerequisites (one-time)

- **Maestro CLI** + a Java runtime (Maestro is a JVM tool):
  ```bash
  # Java 17. The Homebrew *formula* installs without sudo (the temurin cask needs it):
  brew install openjdk@17
  export JAVA_HOME="$(brew --prefix openjdk@17)"
  export PATH="$JAVA_HOME/bin:$PATH"

  # Maestro
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$PATH:$HOME/.maestro/bin"
  maestro --version
  ```
- An iOS Simulator booted, with the app **installed** on it once:
  ```bash
  npm run ios   # native build + install onto the booted simulator
  ```

## Running

Maestro talks to the **already-installed** app and needs Metro serving the JS
bundle with the right env. In separate terminals:

```bash
# 1. backend (staging)
npm run db:staging
npm run api:staging            # :3000

# 2. app bundler with staging env injected
npm run start:staging          # leave running; press i if the app isn't open

# 3. run the E2E flows
maestro test e2e/login_free_user.yaml
maestro test e2e/login_premium_user.yaml
# or the whole folder:
maestro test e2e/
```

A passing run prints `✅  ... Flow Passed` for each step.

> The flows use `appId: com.santivqz.my-expo-app` (the prebuilt iOS bundle id).
> Maestro launches that installed binary; it does **not** build the app itself.
