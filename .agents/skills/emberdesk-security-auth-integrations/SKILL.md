---
name: emberdesk-security-auth-integrations
description: Handle EmberDesk auth, security, secrets, proxies, plugins, and external providers. Use for login/setup/auth changes, sessions, CSRF, whitelists, Host checks, SSRF filtering, CORS proxy, request proxy, API keys, SSO, server plugins, and provider endpoint integrations.
---

# EmberDesk Security Auth Integrations

Use this for security-sensitive work and external service integration changes.

## Read First

- `default/config.yaml`
- `src/server-main.js`
- `src/command-line.js`
- `src/users.js`, `src/user-auth.js`, `src/user-storage.js`
- `src/endpoints/users-public.js`, `src/endpoints/users-private.js`, `src/endpoints/users-admin.js`
- `src/endpoints/secrets.js`, `public/scripts/secrets.js`
- `src/private-request-filter.js`, `src/request-proxy.js`
- `src/middleware/basicAuth.js`, `src/middleware/whitelist.js`, `src/middleware/hostWhitelist.js`, `src/middleware/corsProxy.js`
- Provider route modules under `src/endpoints/` and `src/endpoints/backends/`
- `docs/environments.md` before using remote test infrastructure

## Distinct Security Boundaries

- `enableUserAccounts` is the primary login-page account system.
- `basicAuthMode` is deprecated compatibility behavior and only inserts browser-native auth when `listen` is enabled.
- `whitelistMode` controls allowed client IPs for inbound requests.
- `hostWhitelist` protects Host header / DNS rebinding surfaces.
- `privateAddressWhitelist` protects outbound server-side requests from SSRF to private IPs.
- `enableCorsProxy` enables the optional `/proxy/*url` route and affects CSRF skip logic for proxy requests.
- `requestProxy` routes outbound HTTP/HTTPS through a proxy; it is not the same as SSRF filtering.
- `disableCsrfProtection` is a high-risk startup option and should not be used as a normal fix.
- `allowKeysExposure` controls broad secret visibility; `EXPORTABLE_KEYS` is the narrow exception list.

## Auth And Session Rules

- Do not change cookie/session semantics without reading `src/user-auth.js`, `src/users.js`, login/setup controllers, and auth tests.
- `getCookieSecret(dataRoot)` persists the cookie secret; account versioning invalidates stale sessions.
- `tryAutoLogin()` owns single-user, Authelia, Authentik, and basic auth auto-login branches.
- Login/setup page JavaScript is page-local controller code; preserve `createLoginController()` and `createSetupController()` patterns.
- Never document or commit test server credentials, cookies, tokens, or exported storage.

## Secrets Rules

- Use `SecretManager` or exported helpers (`writeSecret`, `readSecret`, `readSecretState`, `getAllSecrets`) instead of reading `secrets.json` ad hoc.
- Secret writes use `write-file-atomic`; preserve atomic behavior.
- `view` and `find` routes are intentionally constrained by `allowKeysExposure` and `EXPORTABLE_KEYS`.
- Flat secrets and custom-to-OpenAI migration behavior are covered by tests; update tests with any format change.

## External Integrations

- Provider API routes live in `src/endpoints/*.js` and `src/endpoints/backends/*`.
- Vector providers live in `src/vectors/*`.
- Server plugin loading is opt-in through `enableServerPlugins`; plugin discovery/update/validation/init/cleanup are documented in `.docs/tech/plugin-loader-lifecycle.md`.
- Do not add a dependency for a provider or integration without checking existing endpoints, vector modules, request proxy, secrets, and shared fetch helpers.

## Validation

```powershell
bun run --cwd tests test:unit -- user-auth.test.js login-page-controller.test.js setup-page-controller.test.js --runInBand
bun run --cwd tests test:unit -- private-request-filter.test.js secrets-migration.test.js secrets-input-map.test.js --runInBand
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
bun run --cwd tests test:e2e -- login.e2e.js
```

Use the shared test server only for remote-only behavior after local proof. Keep credentials out of repository files and final artifacts.
