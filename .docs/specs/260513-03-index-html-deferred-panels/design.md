# Index HTML Deferred Panels

## Intent & Core Flow

Reduce startup-visible DOM parse and style-recalc cost by removing large, non-first-screen markup blocks from `public/index.html` and loading them only when the user opens the related surface or when the browser is idle after `APP_READY`.

Primary actor: a browser user landing on EmberDesk and later opening advanced text-generation settings or the World Info editor.

Happy path:

1. The browser loads `public/index.html` with the main chat shell, right-nav drawers, and current extension placeholders still present.
2. Heavy, non-first-screen markup that still lives directly in `index.html` is replaced by lightweight placeholders.
3. Startup reaches `APP_READY` without parsing those removed subtrees up front.
4. If the user opens one of the deferred surfaces, EmberDesk loads that fragment once, inserts it into the placeholder, localizes it, then runs the matching post-insert initializer.
5. If the user never opens that surface, EmberDesk never pays the full parse/bind cost for that markup during the session.

## Scope / Out of Scope

### In Scope

- Introduce a small deferred-panel loader for HTML fragments served from `public/`.
- Replace selected `index.html` subtrees with explicit placeholders plus stable panel IDs.
- First migration batch:
  - the World Info editor body under `#world_popup`
  - the large `#textgenerationwebui_api-settings` sampler/settings body
- Make World Info startup work lazy enough that its deferred body can be absent during initial `getSettings.applyCore`.
- Add a single-flight `ensurePanel(id)` path so repeated opens do not refetch or double-initialize.
- Support optional idle warmup after `APP_READY` for already-registered deferred panels.

### Out Of Scope

- Stable Diffusion settings extraction in this slice.
  - Repo fact: Stable Diffusion settings already come from `public/scripts/extensions/stable-diffusion/settings.html` into `#sd_container`, not from a large subtree in `public/index.html`.
- Extensions panel extraction in this slice.
  - Repo fact: `public/script.js` and `public/scripts/extensions.js` touch `#extensions_*` controls during startup before any drawer-open hook.
- Removing the entire `#WorldInfo` drawer shell.
  - `RossAscends-mods.js` grabs `document.getElementById('WorldInfo')`, `#WI_panel_pin`, and `#WIDrawerIcon` at module load, so the drawer container must remain in the initial DOM for this slice.
- Deferring the chat shell, left/right nav drawers, user settings, or API-connection shell.
- CSS splitting, SSR, SPA migration, or script-tag strategy changes.
- Generic fragment infrastructure for every drawer in the app.

### First Shippable Slice

The first shippable slice is:

- defer only markup that still lives in `public/index.html`
- keep each affected drawer shell and startup-visible controls in place
- lazy-load only:
  - `#world_popup`
  - `#textgenerationwebui_api-settings`
- preserve current user-visible behavior after first open

## Edge Rules / Acceptance

Acceptance outcomes:

- Initial startup must still reach the same visible shell and same `APP_READY` meaning used by `.docs/tech/startup-app-ready-optimization.md`.
- Before deferred load:
  - the World Info drawer still exists and can be opened
  - the TextGen API selection shell still exists
  - placeholders are present instead of the removed heavy markup
- On first open of a deferred panel:
  - EmberDesk fetches the fragment once
  - inserts it into the matching placeholder
  - applies locale to inserted content
  - runs the panel-specific initializer
  - then proceeds with the user action that requested the panel
- On later opens of the same panel:
  - EmberDesk reuses the already-loaded DOM and does not fetch again
- If fragment fetch fails:
  - the rest of the app keeps working
  - the placeholder shows a visible retry affordance
  - a second open or explicit retry attempts the load again
- World Info settings loaded during startup must still be preserved and reflected after the deferred body appears.
- TextGen settings loaded during startup must still be preserved and reflected after the deferred body appears.
- Existing delegated handlers must keep working after insertion.
- Non-delegated handlers that currently bind directly to deferred elements must move into the post-insert initializer for that panel.

State coverage:

- `loading`
  - placeholder can show lightweight loading text/spinner while first fetch is in flight
- `success`
  - deferred panel opens with the same controls and persisted values as today
- `error`
  - panel stays unavailable but the main app remains usable
- `recovery`
  - retry re-runs the same single-flight loader after a failed attempt

## Architecture / Constraints

Confirmed repo constraints:

- `public/index.html` is served directly from `public/` by Express static hosting in `src/server-main.js`; fragment files can therefore be served directly from `public/` without adding webpack copy logic for this slice.
- `public/script.js` startup currently calls `setWorldInfoSettings(...)` during `getSettings.applyCore`, and that function writes directly into `#world_info`, `#world_editor_select`, and many `#world_info_*` controls.
- `public/scripts/world-info.js:initWorldInfo()` binds many direct handlers to `#world_popup` descendants, so those bindings cannot run before the deferred body exists.
- `public/scripts/RossAscends-mods.js` captures `#WorldInfo`, `#WI_panel_pin`, and `#WIDrawerIcon` at module load, so the World Info drawer shell must remain in initial markup.
- `public/script.js:changeMainAPI()` and `validateDisabledSamplers()` touch `#textgenerationwebui_api-settings` descendants after startup settings load, so the deferred TextGen panel needs a replay/apply step after insertion.
- Existing deferred-startup precedent already exists in:
  - `public/scripts/startup-helpers.js:createSingleFlightTask`
  - `public/scripts/extensions.js:setDeferredExtensionLoader`

Core design:

1. Add a small `public/scripts/deferred-panels.js` module with:
   - registry
   - loaded set
   - in-flight map
   - `ensurePanel(id)`
2. Serve fragment files directly from `public/panels/<id>.html`.
3. Keep placeholders in `index.html`:
   - inside `#WorldInfo`, replace `#world_popup` body with a placeholder
   - inside the TextGen section, replace the body of `#textgenerationwebui_api-settings` with a placeholder while leaving the shell element itself present
4. Register per-panel `onLoad` hooks:
   - `world-info-body`
     - bind handlers that currently live in `initWorldInfo()`
     - apply cached startup settings values to the newly inserted controls
     - initialize select2 and editor-specific bindings only after the body exists
   - `textgen-api-settings`
     - bind any non-delegated controls that require the inserted sampler DOM
     - replay loaded settings and sampler visibility logic
5. Add a pre-open gate for the specific drawer/open flows that require the panel content:
   - World Info drawer open
   - switching to `main_api === 'textgenerationwebui'`
6. Optional idle warmup can call `ensurePanel(id)` after `APP_READY`, but correctness must not depend on warmup completing.

Implementation constraints:

- Prefer the smallest loader that only solves these two panels.
- Do not introduce new dependencies.
- Do not move Stable Diffusion, extension-manager internals, or other extension templates into this slice.
- Do not require fragment hashing or build-pipeline changes for approval of this first slice.
- Preserve IDs and selectors inside migrated fragments so existing code can be reused after lazy init.

## Data / Integrations

### Deferred Surfaces

- `world-info-body`
  - source today: `public/index.html` subtree rooted at `#world_popup`
  - host shell remains: `#WorldInfo`
  - startup data source: `setWorldInfoSettings(settings.world_info_settings ?? settings, data)`
- `textgen-api-settings`
  - source today: `public/index.html` subtree rooted at `#textgenerationwebui_api-settings`
  - host shell remains: API connection drawer / `changeMainAPI()` flow
  - startup data source: `loadTextGenSettings(data, settings)`

### Required Code Touchpoints

- `public/index.html`
- `public/script.js`
  - `changeMainAPI()`
  - `applyStartupSettingsCore()`
  - drawer-open wiring
- `public/scripts/world-info.js`
  - split eager data state from DOM-binding/init work
- `public/scripts/RossAscends-mods.js`
  - keep shell compatibility
- `public/scripts/i18n.js`
  - `applyLocale(...)`
- `public/scripts/startup-helpers.js`
  - reuse the single-flight pattern or keep behavior equivalent

### Data Preservation Rule

- Startup-loaded settings remain the source of truth even if the deferred DOM is not present yet.
- The deferred panel initializer must read from already-loaded JS state and push those values into the inserted DOM after load.
- No settings payload or server API shape changes are required.

## Verification

Expected implementation proof:

```bash
npm run lint
npm --prefix tests run test:unit -- --runInBand startup-deferred-panels.test.js
```

Expected test coverage:

- placeholder-only startup does not throw before `APP_READY`
- `ensurePanel('world-info-body')` loads once and initializes once
- `ensurePanel('textgen-api-settings')` loads once and initializes once
- startup-loaded World Info settings appear after deferred insertion
- startup-loaded TextGen settings appear after deferred insertion
- failed fetch leaves retryable placeholder state

Required manual checks:

1. Start EmberDesk and confirm the main shell appears normally.
2. Open the World Info drawer for the first time and confirm the body loads, localizes, and all controls work.
3. Confirm pinned/unpinned World Info drawer behavior still works.
4. Switch to the TextGen API and confirm the advanced sampler/settings panel appears with current values and working controls.
5. Repeat open/close actions and confirm fragments are not refetched.
6. Simulate a fragment-load failure and confirm the rest of the app remains usable with a retry path.

Expected performance evidence:

- compare startup traces before/after with the same profile and machine
- initial DOM node count drops materially
- startup parsing/style time improves without changing `APP_READY` semantics

## Doc ID Contract

This slice supports existing startup and settings surfaces without introducing a new user-facing feature.

Existing semantic IDs affected:

- `feature.startup_bootstrap`
- `feature.world_info_editor`
- `feature.api_connection_panel`

Documentation follow-up after delivery:

- update `.docs/tech/startup-app-ready-optimization.md` with the deferred-markup loader and the rule that startup data can exist before panel DOM exists

## References

- `public/index.html`
- `public/script.js`
- `public/scripts/world-info.js`
- `public/scripts/RossAscends-mods.js`
- `public/scripts/i18n.js`
- `public/scripts/startup-helpers.js`
- `public/scripts/extensions.js`
- `src/server-main.js`
- `.docs/tech/startup-app-ready-optimization.md`
- Inference: the safest first slice is to defer only markup still owned by `index.html`, because extension-managed HTML such as Stable Diffusion already follows a different loading path.
