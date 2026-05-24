# Frontend jQuery Slice Migration

## Module Responsibility

This document records EmberDesk's repeatable migration pattern for shrinking legacy jQuery page scripts into narrow, testable page controllers.

The first shipped slice is the login page controller:

- `public/scripts/login.js` - login page behavior, exported helpers, controller initializer, and production auto-init wrapper
- `public/login.html` - stable login page markup and script host
- `tests/login-page-controller.test.js` - focused helper and controller regression proof
- `tests/login.e2e.js` - Playwright proof for user-visible login and recovery behavior

This is not a framework migration. EmberDesk still uses the existing HTML/CSS/jQuery frontend, and this pattern only removes page-local jQuery dependencies when the slice can stay small and independently validated.

## Architecture And Constraints

Frontend migration slices must preserve the existing product flow unless the semantic docs and implementation already disagree and the slice explicitly resolves that drift.

For the login page, the controller owns the static DOM surface under `public/login.html`:

- login card and login form
- handle and password inputs
- password visibility toggle
- login error block
- recovery card and recovery form
- recovery-step sections and recovery error block

The controller intentionally fails during initialization if a required element is missing. Silent partial initialization would hide template drift and leave the login page in an unsafe mixed state.

Production behavior remains auto-initialized from the module script so `public/login.html` does not need a new bootstrap layer. Tests disable auto-init with `globalThis.EMBERDESK_LOGIN_TEST_MODE` and call `initLoginPage()` deliberately.

The login slice keeps the existing API boundary:

- `GET /csrf-token`
- `POST /api/users/login`
- `POST /api/users/recover-step1`
- `POST /api/users/recover-step2`

It does not remove the global jQuery script tag from `public/login.html`; that cleanup has a broader compatibility surface than this page-controller extraction.

## Core Implementation

`public/scripts/login.js` now follows this shape:

1. localized message constants
2. pure helpers for decision logic
3. required-element collection
4. DOM update helpers
5. `createLoginController(root, dependencies)`
6. `initLoginPage(root, dependencies)`
7. production auto-init wrapper

The exported pure helpers cover behavior that should remain testable without a live browser page:

- auth error message mapping
- post-login redirect URL calculation that removes only `noauto`
- password visibility next state
- recovery-step detection
- lockout countdown message formatting

`createLoginController()` owns event binding through direct `addEventListener()` calls on page elements. It uses an `AbortController` so tests and future partial-page lifecycles can remove page-owned listeners and timers through a returned cleanup function.

The recovery success behavior now matches the semantic contract: after a successful password reset, the user returns to the login card and must sign in again. The recovery flow does not auto-authenticate.

## Migration Rules For Future Slices

Use this pattern only for small, bounded frontend surfaces:

- choose one route, page, or panel with a clear DOM root
- preserve route, markup, API paths, request bodies, and visible copy unless drift is explicitly resolved
- extract pure decision logic before reshaping handlers
- inject only dependencies that remove hard browser globals from focused tests
- bind events to the nearest stable page or component elements, not to `document` as a convenience
- return cleanup for listeners and timers
- keep Playwright assertions user-visible through role and label locators when possible
- avoid framework, TypeScript, bundler, or global-library changes inside a page-controller slice

Do not use this pattern for the main chat workspace until global startup, extension coupling, and shared-library compatibility have their own isolated proofs.

## Validation

Focused proof for this slice:

```powershell
cd tests
bun run test:unit -- login-page-controller.test.js --runInBand
bun run test:e2e -- login.e2e.js
bun run test:e2e -- sample.e2e.js
```

Docs proof:

```powershell
bun run docs:check
bun run docs:build
```

The Playwright E2E commands require the local EmberDesk server to be running because the current Playwright config does not define a `webServer`.

## Related Semantic IDs And Code Binding Points

Semantic IDs:

- `page.login`
- `feature.login_submit`
- `feature.password_toggle`
- `feature.password_recovery`
- `feature.account_lockout`

Stable binding points:

- `initLoginPage()` in `public/scripts/login.js`
- `createLoginController()` in `public/scripts/login.js`
- `globalThis.EMBERDESK_LOGIN_TEST_MODE` import guard in `public/scripts/login.js`
- login page markup IDs in `public/login.html`

Related docs:

- [Login Page](../db/pages/login.md)
- [Password Recovery](../db/features/password-recovery.md)
