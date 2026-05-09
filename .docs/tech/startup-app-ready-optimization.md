# Startup APP_READY Optimization

## Module Responsibility

This document covers the implementation that shortens browser startup for the already-running-service scenario without redefining `APP_READY`.

Primary files:

- `public/script.js`
- `public/scripts/startup-helpers.js`
- `public/scripts/backgrounds.js`
- `public/scripts/extensions.js`
- `public/scripts/action-loader.js`
- `scripts/startup-performance-runner.mjs`
- `src/server-startup-profiler.js`
- `src/performance-report.js`

## Architecture And Constraints

- `APP_READY` still means the main shell is visible and usable.
- Startup keeps the current jQuery architecture and event names.
- The optimization strategy is to remove non-first-screen work from the critical path, not to rename readiness events or change framework stack.
- Daily-use measurement is browser-first and uses the `existing_server_browser_only` mode.

## Core Implementation

### Frontend critical path

`public/script.js` now separates startup into:

- `getSettings.fetch`
- `getSettings.applyCore`
- post-ready deferred tasks

Critical path work still includes:

- CSRF fetch
- secrets and locale bootstrap
- core module registration
- extension UI skeleton binding
- settings core apply
- avatars and characters
- loader removal
- `APP_READY`

### Deferred startup

Post-ready work is scheduled through single-flight tasks from `public/scripts/startup-helpers.js`:

- `deferred.getClientVersion`
- `deferred.getBackgrounds`
- `deferred.loadExtensionSettings`

`public/scripts/backgrounds.js` uses a single-flight catalog loader so startup warmup, panel-open reads, and explicit refreshes do not duplicate the same request. If a refresh is requested while the current load is still in flight, the refresh queues one more run after the active request finishes.

`public/scripts/extensions.js` exposes a deferred loader hook so the extensions UI can show a local placeholder and wait for the same in-flight activation task before opening details. When deferred loading fails, the placeholder switches to a retry state instead of leaving a permanent spinner behind.

### Loader exit behavior

`public/scripts/action-loader.js` adds `overlayHideMode`.

- Startup overlay uses `immediate`
- regular loaders keep the default animated path

This allows the first overlay to stop consuming a fixed chunk of `APP_READY` budget without changing the rest of the loader system.

### Measurement

`scripts/startup-performance-runner.mjs` now:

- waits for spawned servers before navigation in local mode
- supports direct URL sampling for already-running services
- waits briefly for deferred startup stages so the report captures post-ready work
- kills the spawned server with `SIGKILL` if shutdown does not complete in time

`src/server-startup-profiler.js` now records failure stacks alongside the error message, and `src/performance-report.js` remains the stable server/profile summary surface.

## Related Semantic IDs And Code Binding Points

Relevant semantic docs now live in `.docs/db/`:

- `page.chat_workspace`
- `feature.startup_bootstrap`
- `feature.background_library_panel`
- `feature.extension_panel_open`

Stability-sensitive binding points:

- `event_types.APP_READY`
- `event_types.APP_INITIALIZED`
- `event_types.SETTINGS_LOADED`
- `event_types.EXTENSION_SETTINGS_LOADED`
- startup report metric `navigationToAppReadyMs`

## Performance And Caching

- Deferred tasks use single-flight caching to prevent duplicate warmup requests during startup.
- Background refresh paths can queue a follow-up refresh after the current load completes.
- Existing-server reports should be compared with the same profile, URL, and machine because startup is sensitive to browser cache and content state.
