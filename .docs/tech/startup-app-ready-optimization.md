# Startup APP_READY Optimization

## Module Responsibility

This document covers the implementation that shortens browser startup for the already-running-service scenario without redefining `APP_READY`. The browser entry and composition boundary are defined by `bootstrapWorkspace()` in `public/script.js`; this document focuses on readiness optimization rather than the complete composition-root contract.

Primary files:

- `public/script.js`
- `public/scripts/request-context.js`
- `public/scripts/public-api.js`
- `public/scripts/events.js`
- `public/scripts/startup-helpers.js`
- `public/scripts/backgrounds.js`
- `public/scripts/extensions.js`
- `public/scripts/action-loader.js`
- `scripts/startup-performance-runner.mjs`
- `src/endpoints/settings-cache.js`
- `src/server-startup-profiler.js`
- `src/performance-report.js`

## Architecture And Constraints

- `APP_READY` still means the main shell is visible and usable.
- Startup keeps the current jQuery architecture and event names.
- The optimization strategy is to remove non-first-screen work from the critical path, not to rename readiness events or change framework stack.
- Daily-use measurement is browser-first and uses the `existing_server_browser_only` mode.

## Core Implementation

### Frontend critical path

`public/script.js` now exposes the named `bootstrapWorkspace()` startup sequence and separates startup into:

- `getSettings.fetch`
- `getSettings.applyCore`
- post-ready deferred tasks

Before that sequence begins, module composition installs `globalThis.SillyTavern` explicitly, registers the World Info shell context, and installs the jQuery CSRF prefilter. `bootstrapWorkspace()` then loads the CSRF token as its first measured stage. Request-context failure is propagated to the bootstrap owner and shows a persistent refresh error; no readiness event is emitted on that path.

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

### Settings-cache for /api/settings/get

`src/endpoints/settings-cache.js` provides an in-process directory payload cache used by `POST /api/settings/get`. Stability-sensitive constraints:

- The cache key is the absolute directory path, which naturally partitions by user.
- `getCachedPayload(dirPath, rebuild)` implements single-flight rebuild: concurrent callers for the same uncached directory await one shared rebuild promise instead of triggering duplicate work.
- Cache freshness is driven by explicit invalidation from EmberDesk-controlled write paths, not by per-request directory stat polling.
- Invalidated write paths include: presets save/delete, themes save/delete, moving-ui save, quick-replies save/delete, world-info delete/import/edit, and content-manager seeding into user directories.
- The route handler in `src/endpoints/settings.js` now executes all independent directory reads concurrently via `Promise.all` instead of serially blocking the event loop.

### Deferred panels

`public/scripts/deferred-panels.js` provides a lazy-loading fragment loader for heavy markup blocks extracted from `public/index.html`. Stability-sensitive constraints:

- `ensurePanel(id)` fetches a fragment from `/panels/<id>.html`, inserts it into the matching `[data-deferred-panel]` placeholder, applies locale, and runs registered post-load hooks. Repeated opens reuse the already-loaded DOM without refetching.
- The loader uses single-flight semantics: concurrent `ensurePanel` calls for the same panel share one fetch.
- Failed fetches leave a retryable placeholder; the rest of the app stays functional.
- Post-load hooks (`registerPanelHook`) allow panel-specific initializers to bind handlers and replay startup-loaded settings into the newly inserted DOM. The rule is: startup data can exist before the panel DOM exists, and the hook replays it after lazy insertion.
- First batch: World Info editor body (`world-info-body`) and TextGen API settings (`textgen-api-settings`).
- An idle warmup path may call `ensurePanel` after `APP_READY`, but correctness must not depend on warmup completing.

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

The full root ownership and reverse-import contract is documented in [Workspace Composition Root](workspace-composition-root.md). The current processing order and failure boundaries are reproduced by [Workspace Composition Root Processing Flow](../logic-description/workspace_composition_root_processing_flow.md).

## Performance And Caching

- Deferred tasks use single-flight caching to prevent duplicate warmup requests during startup.
- Background refresh paths can queue a follow-up refresh after the current load completes.
- Existing-server reports should be compared with the same profile, URL, and machine because startup is sensitive to browser cache and content state.
