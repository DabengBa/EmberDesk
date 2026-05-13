# Index HTML Deferred Panels

## Why

`public/index.html` carried large non-first-screen markup blocks that were always parsed, styled, and laid out during initial page load — even when the user never opened those surfaces in a session. The World Info editor body and TextGen API advanced settings block together accounted for ~680 lines of server-sent markup that startup paid for every time.

## Delivered

### Deferred panel loader

`public/scripts/deferred-panels.js` provides a lazy-loading fragment system for heavy markup blocks extracted from `public/index.html`.

Core API:
- `ensurePanel(id)` — fetches `/panels/<id>.html`, inserts into the matching `[data-deferred-panel]` placeholder, runs `applyLocale` on inserted content, then triggers registered post-load hooks. Single-flight: concurrent calls share one fetch. Loaded once, reused on subsequent opens.
- `registerPanelHook(id, hook)` — registers a `(container: HTMLElement) => void` callback that runs after successful fragment insertion.
- `isPanelLoaded(id)` — returns `true` when the panel is loaded and initialized.

State machine: `loading → loaded | error`. Failed fetches show a retry affordance with click-to-retry delegated handler.

### World Info editor body extraction

File: `public/panels/world-info-body.html` (48 lines)

`public/index.html`: replaced `#world_popup` inner content (~47 lines) with a placeholder div containing a spinner and `data-deferred-panel="world-info-body"`.

Post-load hook: `_replayWorldInfoSettings()` replays startup-loaded World Info settings into the newly inserted controls, then re-runs init and `changeMainAPI` so select2 and editor bindings apply.

The World Info drawer shell (`#WorldInfo`, `#WI_panel_pin`, `#WIDrawerIcon`) remains in initial markup for `RossAscends-mods.js` module-load compatibility.

### TextGen API settings extraction

File: `public/panels/textgen-api-settings.html` (634 lines)

`public/index.html`: replaced `#textgenerationwebui_api-settings` inner content (~634 lines) with a placeholder div containing a spinner and `data-deferred-panel="textgen-api-settings"`.

Post-load hook: `_replayTextGenSettings()` replays startup-loaded TextGen settings and sampler visibility into the deferred body.

`changeMainAPI()` now gates with `ensurePanel('textgen-api-settings')` before accessing deferred DOM when `selectedVal === 'textgenerationwebui'`.

### Idle warmup

`startDeferredStartupTasks()` now schedules `requestIdleCallback(() => { ensurePanel('world-info-body'); ensurePanel('textgen-api-settings'); })` after `APP_READY`. Correctness does not depend on warmup completing.

## Validation

### Lint

- `npm run lint` — clean on changed files (removed unused `isPanelLoaded` import)

### Unit tests

- `npm --prefix tests run test:unit -- --runInBand` — 393/394 passed (1 pre-existing failure unrelated to this slice)

### Manual verification

- Main shell appears normally on startup
- World Info drawer opens and loads body on first access, all controls work
- Pinned/unpinned World Info drawer behavior preserved
- TextGen API settings panel appears with current values and working controls
- Repeated open/close reuses loaded DOM without refetch
- Failed fragment load leaves retryable placeholder

## Documentation

Updated:
- `.docs/tech/startup-app-ready-optimization.md` — added "Deferred panels" section describing `ensurePanel`, single-flight, error retry, post-load hooks, data-before-DOM rule, first-batch panel list, and idle warmup

## Doc ID Contract

Supports existing startup and settings surfaces without introducing a new user-facing feature. Existing semantic IDs affected:
- `feature.startup_bootstrap`
- `feature.world_info_editor`
- `feature.api_connection_panel`

Documentation rule recorded: startup data can exist before panel DOM exists; post-load hooks replay it after lazy insertion.

## Boundaries

- Only two panels migrated in this slice: World Info editor body and TextGen API settings
- Stable Diffusion settings already use a different loading path (`public/scripts/extensions/stable-diffusion/settings.html` → `#sd_container`)
- Extensions panel not migrated in this slice (startup code touches `#extensions_*` controls before drawer-open)
- Drawer shells and startup-visible controls stay in initial markup
- No CSS splitting, SPA migration, or script-tag strategy changes
- No fragment hashing or build-pipeline changes required