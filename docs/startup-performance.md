# Startup Performance

## What This Measures

EmberDesk startup is split into two practical scenarios:

- `spawn_local_server`
  Measures Node cold start plus the first browser load.
- `existing_server_browser_only`
  Measures what daily users feel after the service is already running: open URL -> `APP_READY`.

For the user-facing startup problem, the second mode is the primary one.

## Commands

Run a local cold-start sample:

```bash
npm run perf:startup
```

Run a browser-only sample against an already-running URL:

```bash
npm run perf:startup -- --url http://127.0.0.1:8130/
```

## Output

Each run writes into `artifacts/startup-performance/<timestamp>/`:

- `report.json`
- `report.md`
- `page.png`
- `server-startup-profile.json` when the runner spawned the server itself
- `pm-check.json` or walkthrough artifacts when a manual review flow was recorded

## How To Read The Result

For an already-running service, watch these in order:

1. `navigationToAppReadyMs`
2. `appInitAfterLoadMs`
3. `getSettings.fetch`
4. `getSettings.applyCore`
5. `hideInitLoader`
6. `deferred.getClientVersion`
7. `deferred.getBackgrounds`
8. `deferred.loadExtensionSettings`

For local cold start, also watch:

1. `serverReadyMs`
2. `webpackCompile`
3. other server startup stages in `server-startup-profile.json`

## Current Startup Model

The optimized browser startup path now follows three buckets:

- `Critical Before APP_READY`
  Includes shell bootstrap, settings fetch/core apply, avatars, characters, and loader removal.
- `Deferred After APP_READY`
  Includes client version fetch, extension discovery/activation, and background library warmup.
- `On Demand / Refresh`
  Includes panel-driven re-fetches such as background refresh after upload or settings changes.

Background and extension warmup use single-flight behavior, so opening the panel during deferred startup reuses the same in-flight work instead of duplicating requests. A forced background refresh now queues one more fetch after the active load if startup warmup is still in flight.

If deferred extension loading fails, the startup placeholder switches to an explicit retry state instead of leaving a permanent loading spinner in the extensions area.

## Reference Samples

For the daily-use scenario, keep the existing-server sample as the primary regression reference.

Latest `existing_server_browser_only` sample on `2026-05-08`:

- `navigationToAppReadyMs`: `977.0 ms`
- `navigationToLoadMs`: `411.4 ms`
- `appInitAfterLoadMs`: `565.6 ms`
- `totalBlockingTimeMs`: `281 ms`

Reference artifact:

- `artifacts/startup-performance/2026-05-08T11-16-43-642Z/report.md`

Latest `spawn_local_server` sample on `2026-05-09`:

- `serverReadyMs`: `10784.9 ms`
- `navigationToAppReadyMs`: `1011.7 ms`
- `navigationToLoadMs`: `345.3 ms`
- `appInitAfterLoadMs`: `666.4 ms`
- `getSettings.fetch`: `47.7 ms`
- `getSettings.applyCore`: `133.3 ms`
- `hideInitLoader`: `5.7 ms`

Reference artifact:

- `artifacts/startup-performance/2026-05-09T01-22-30-074Z/report.md`

These samples are regression references, not universal SLAs.
