# Browser Startup APP_READY Optimization

## Why

The scoped problem was the daily-use startup path for an already-running EmberDesk service: open the URL, wait for the shell to become truly usable, and reduce that time without changing the meaning of `APP_READY`.

The baseline existing-server sample on `2026-05-08` was about `2019.1 ms` from navigation to `APP_READY`, with the dominant cost inside post-load frontend initialization.

## Delivered

### Measurement and evidence

- Added a repeatable startup runner with:
  - local cold-start mode
  - existing-server browser-only mode
  - stable JSON/Markdown artifacts
  - server boot profiling
  - deferred-stage capture after `APP_READY`
- Added deterministic summary logic and unit coverage for the report surface.
- Added PM-check and UX-walkthrough browser artifacts for the final reviewed path.

### Browser critical-path reduction

- Split startup settings into:
  - `getSettings.fetch`
  - `getSettings.applyCore`
- Removed these from the `APP_READY` blocking path:
  - client version fetch
  - extension discovery / manifest fetch / activation
  - background library warmup
- Preserved `APP_READY`, `APP_INITIALIZED`, `SETTINGS_LOADED`, and `EXTENSION_SETTINGS_LOADED` event names.

### Deferred/on-demand behavior

- Added single-flight startup helpers so deferred tasks can be reused instead of duplicated.
- Background warmup now reuses one in-flight request and supports explicit force refresh for upload/settings-change paths.
- Extensions now show a local startup placeholder and can wait on the same deferred activation promise before opening details.

### Loader behavior

- Added startup-only immediate overlay hide while keeping the normal animated loader path for later operations.

### Documentation

- Updated `docs/startup-performance.md` for the final measurement model and current interpretation order.
- Added `.docs/tech/startup-app-ready-optimization.md` for the implementation structure and constraints.

## Result

Latest reviewed existing-server sample:

- `navigationToAppReadyMs`: `977.0 ms`
- `appInitAfterLoadMs`: `565.6 ms`
- `getSettings.fetch`: `23.4 ms`
- `getSettings.applyCore`: `149.2 ms`
- `hideInitLoader`: `6.6 ms`
- deferred stages recorded after ready:
  - `deferred.getBackgrounds`
  - `deferred.getClientVersion`
  - `deferred.loadExtensionSettings`

This is a reduction of roughly `51.6%` versus the original `2019.1 ms` existing-server baseline.

## Validation

- Unit proof:
  - `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json tests/performance-report.test.js tests/startup-critical-path.test.js tests/startup-deferred-tasks.test.js tests/startup-loader.test.js`
- Spawned-server browser artifact:
  - `artifacts/startup-performance/2026-05-08T11-13-23-048Z/report.md`
- Existing-server browser artifact:
  - `artifacts/startup-performance/2026-05-08T11-16-43-642Z/report.md`
- PM/browser check:
  - `artifacts/startup-performance/2026-05-08T11-16-43-642Z/pm-check.json`
- UX walkthrough:
  - `artifacts/startup-performance/2026-05-08T11-16-43-642Z/ux-walkthrough.md`
  - `artifacts/startup-performance/2026-05-08T11-16-43-642Z/ux-walkthrough.json`

## Doc ID Contract

- No semantic Doc IDs were introduced or migrated in this feature.
- Stability-sensitive names preserved:
  - `event_types.APP_READY`
  - `event_types.APP_INITIALIZED`
  - `event_types.SETTINGS_LOADED`
  - `event_types.EXTENSION_SETTINGS_LOADED`
  - `navigationToAppReadyMs`
