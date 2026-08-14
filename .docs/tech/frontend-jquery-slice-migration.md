# Frontend jQuery Slice Migration

## Module Responsibility

This document records EmberDesk's repeatable migration pattern for shrinking legacy jQuery page scripts into narrow, testable page controllers.

The shipped slices are:

- `public/scripts/login.js` - login page behavior, exported helpers, controller initializer, and production auto-init wrapper
- `public/login.html` - stable login page markup and script host
- `tests/login-page-controller.test.js` - focused helper and controller regression proof
- `tests/login.e2e.js` - Playwright proof for user-visible login and recovery behavior
- `public/scripts/setup.js` - setup page behavior, exported helpers, controller initializer, and production auto-init wrapper
- `public/setup.html` - stable setup page markup and script host
- `tests/setup-page-controller.test.js` - focused helper and controller regression proof for `fresh` and `set-password` setup modes
- `public/scripts/background-panel-controller.js` - background-library panel loading state helper and root-scoped controller
- `tests/background-panel-controller.test.js` - focused proof for background panel state classification, fail-fast initialization, root scoping, and cleanup
- `public/scripts/chat-message-actions-controller.js` - low-risk message action menu affordance controller for extra-action expand/collapse behavior
- `tests/chat-message-actions-controller.test.js` - focused proof for delegated action dispatch, duplicate-init safety, expanded-action close rules, and cleanup
- `public/scripts/provider-secret-field-state.js` - state-only API drawer helper for unified key and fallback provider secret status/save/clear decisions
- `tests/helpers/frontend-structure-contract.js` - tests-only helper for selector, order, role/name, aria-live, and source-marker structure contracts

This is not a framework migration. EmberDesk still uses the existing HTML/CSS/jQuery frontend, and this pattern only removes page-local jQuery dependencies when the slice can stay small and independently validated.

React page and panel islands are a separate modernization route recorded in [ADR-0007](../adr/0007-react-page-islands-with-legacy-fallbacks.md) and [React Modernization Roadmap](react-modernization-roadmap.md). The jQuery slice pattern remains valid for small legacy controller extractions, but it is not the owner for `/login`, `/setup`, `/settings`, or the guarded character-library React island.

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

For the setup page, the controller owns the static DOM surface under `public/setup.html`:

- setup card and setup form
- handle and display-name fields in `fresh` mode
- password and confirm-password inputs
- password visibility toggles
- setup mode application for the single passwordless-user `set-password` path
- setup error block

The setup slice keeps the existing API boundary:

- `GET /csrf-token`
- `GET /api/users/setup-mode`
- `POST /api/users/setup`

It does not remove the global jQuery script tag from `public/setup.html`; that cleanup has a broader compatibility surface than this page-controller extraction.

For the background library panel, the controller owns only the local loading indicator under `#bg_menu_content`:

- required-element detection for the system background container
- loading indicator creation/removal using the existing `bg_startup_loading` id and existing visual classes
- injected loading copy so production keeps the localized `Loading backgrounds...` text
- cleanup that removes controller-owned loading state

The background slice intentionally does not own upload, delete, rename, folder assignment, background selection, slash-command registration, thumbnail generation, or `/api/backgrounds/*` request behavior. `public/scripts/backgrounds.js` still owns those flows and only delegates `setBackgroundCatalogLoading()` to the controller.

When `features.react.panels.backgroundLibrary` is enabled, the React workspace-panel scaffold reads this same loading state as an additive status host inside `#Backgrounds`. That host reports loading/empty/success state and global/chat gallery counts, but it does not become the owner of any background action flow. The bridge helper can accept an error override for future callers, but the current production background event only dispatches loading state.

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

`public/scripts/setup.js` follows the same shape with `createSetupController(root, dependencies)`, `initSetupPage(root, dependencies)`, `globalThis.EMBERDESK_SETUP_TEST_MODE`, focused setup helper exports, and page-owned listener cleanup.

`public/scripts/background-panel-controller.js` is a smaller panel-local variant of the same migration rule. It exports pure state classification through `getBackgroundPanelState()`, fail-fast controller creation through `createBackgroundPanelController(root, dependencies)`, and cleanup for controller-owned DOM state. Production code keeps the existing background module load order and routes all network, folder, thumbnail, and slash-command work through `public/scripts/backgrounds.js`.

`public/scripts/chat-message-actions-controller.js` applies the same root-scoped controller rule to a narrow main-chat affordance. It owns only the delegated expand/collapse behavior for `.extraMesButtonsHint` and `.extraMesButtons`, preserves existing selectors and animation settings, and exposes `MESSAGE_ACTION_TIERS` as a local implementation note for high-frequency, secondary, and danger action grouping. It does not own message body rendering, edit/delete business logic, swipe handling, reasoning controls, media controls, streaming, or slash-command message injection.

`public/scripts/provider-secret-field-state.js` is not a page controller, but it follows the same small-slice rule: isolate decision logic, inject dependencies through callers and tests, and keep jQuery DOM binding in the existing owner. It covers unified-key placeholder/value state, fallback provider readiness, save/clear decisions, and mask toggling for the API drawer.

`tests/helpers/frontend-structure-contract.js` is a tests-only companion for small frontend slices. It centralizes repeated contract assertions while keeping each test's contract inventory explicit. It should prefer role/name, label, `aria-live`, document order, and selector uniqueness before falling back to raw source markers.

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

```bash
cd tests
pnpm run test:unit -- login-page-controller.test.js --runInBand
pnpm run test:unit -- setup-page-controller.test.js --runInBand
pnpm run test:unit -- background-panel-controller.test.js --runInBand
pnpm run test:unit -- chat-message-actions-controller.test.js --runInBand
pnpm run test:unit -- provider-secret-field-state.test.js --runInBand
pnpm run test:unit -- frontend-structure-contract.test.js --runInBand
pnpm run test:e2e -- login.e2e.js
pnpm run test:e2e -- sample.e2e.js
```

Docs proof:

```bash
pnpm run docs:check
pnpm run docs:build
```

The Playwright config starts its own seeded EmberDesk server through `tests/playwright.config.js`. It runs `scripts/seed-dev-environment.mjs` with a temporary data root and config path, then starts `node server.js` for the selected base URL. Use `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_PORT`, `PLAYWRIGHT_DATA_ROOT`, `PLAYWRIGHT_CONFIG_PATH`, `PLAYWRIGHT_USER`, `PLAYWRIGHT_PASSWORD`, or `PLAYWRIGHT_REUSE_SERVER=0` only when overriding that default test server behavior.

## Related Semantic IDs And Code Binding Points

Semantic IDs:

- `page.login`
- `feature.login_submit`
- `feature.password_toggle`
- `feature.password_recovery`
- `feature.account_lockout`
- `page.setup`
- `feature.first_time_setup`
- `feature.background_library_panel`

Stable binding points:

- `initLoginPage()` in `public/scripts/login.js`
- `createLoginController()` in `public/scripts/login.js`
- `globalThis.EMBERDESK_LOGIN_TEST_MODE` import guard in `public/scripts/login.js`
- login page markup IDs in `public/login.html`
- `initSetupPage()` in `public/scripts/setup.js`
- `createSetupController()` in `public/scripts/setup.js`
- `globalThis.EMBERDESK_SETUP_TEST_MODE` import guard in `public/scripts/setup.js`
- setup page markup IDs in `public/setup.html`
- `createBackgroundPanelController()` in `public/scripts/background-panel-controller.js`
- `getBackgroundPanelState()` in `public/scripts/background-panel-controller.js`
- `setBackgroundCatalogLoading()` delegation in `public/scripts/backgrounds.js`
- `emberdesk:background-library-state-change` dispatch in `public/scripts/backgrounds.js`
- `ensureBackgroundLibraryReactHost()` and `getBackgroundLibraryReactBridgeState()` in `public/script.js`
- `createChatMessageActionsController()` in `public/scripts/chat-message-actions-controller.js`
- `MESSAGE_ACTION_TIERS` in `public/scripts/chat-message-actions-controller.js`
- extra message action menu delegation from `public/script.js`
- `getFallbackProviderStatus()` in `public/scripts/provider-secret-field-state.js`
- `saveProviderSecretField()` in `public/scripts/provider-secret-field-state.js`
- `tests/helpers/frontend-structure-contract.js`

Related docs:

- [Login Page](../db/pages/login.md)
- [Setup Page](../db/pages/setup.md)
- [Password Recovery](../db/features/password-recovery.md)
- [Background Library Panel](../db/features/background-library-panel.md)
- [API Configuration](../db/pages/api-configuration.md)
- [Fallback Provider](../db/features/fallback-provider.md)
- [Frontend Structure Contracts](frontend-structure-contracts.md)
- [ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md)
- [React Modernization Roadmap](react-modernization-roadmap.md)
