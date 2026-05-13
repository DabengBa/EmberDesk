# Settings GET Async Concurrent

## Why

`POST /api/settings/get` was the last remaining server-side blocker in the startup-visible `getSettings.fetch` stage. Its serialized synchronous directory walks blocked the event loop while reading settings.json plus 12 separate directories, delaying `getSettings.applyCore` and ultimately `APP_READY`.

## Delivered

### Concurrent async directory reads

`src/endpoints/settings.js` router for `POST /api/settings/get` now executes all independent directory reads via `Promise.all` instead of blocking the event loop on one sync filesystem call at a time.

The handler reads:
- root `settings.json`
- 4 preset directories (KoboldAI, NovelAI, OpenAI, TextGen) with paired name lists
- 7 parsed directory payloads (themes, movingUI, quickreplies, instruct, context, sysprompt, reasoning)
- world name list

Each uses the async helpers in `src/endpoints/settings-cache.js` (described below) and the results land in the same response shape with the same keys, ordering, and per-field values.

### In-process directory cache

`src/endpoints/settings-cache.js` provides a `Map<string, { payload, inflight }>` cache keyed by absolute directory path. The three async helpers:
- `readAndParseFromDirectoryAsync` — replaces the old sync `readAndParseFromDirectory`
- `readPresetsFromDirectoryAsync` — replaces the old sync `readPresetsFromDirectory`
- `readWorldNamesAsync` — reads world basenames sorted locale-aware

`getCachedPayload(dirPath, rebuild)` implements single-flight rebuild: concurrent callers for the same uncached directory await one shared rebuild promise instead of triggering duplicate work.

Cache freshness is driven by explicit invalidation from EmberDesk-controlled write paths, not by per-request directory stat polling.

### Explicit cache invalidation

`invalidateDirectory(dirPath)` is called after successful writes in each covered endpoint:
- `src/endpoints/presets.js` — `/save`, `/delete`
- `src/endpoints/themes.js` — `/save`, `/delete`
- `src/endpoints/moving-ui.js` — `/save`
- `src/endpoints/quick-replies.js` — `/save`, `/delete`
- `src/endpoints/worldinfo.js` — `/delete`, `/import`, `/edit`
- `src/endpoints/content-manager.js` — `seedContent()` returns `affectedTargets` (a `Set` of directory paths that received seeded content); `seedContentForUser()` invalidates each after seeding

### Cleanup

Removed three unused sync helper functions from `src/endpoints/settings.js`: `readAndParseFromDirectory`, `readPresetsFromDirectory`, `sortByName`.

## Validation

### Lint

- `npm run lint` — clean (excluding pre-existing `public/scripts/backgrounds.js` indent errors)

### Unit tests

- `npm --prefix tests run test:unit -- --runInBand` — 393/394 passed (1 pre-existing failure in interaction-performance-index.test.js unrelated to this slice)

### Manual verification

- Response JSON shape unchanged: same top-level keys, same ordering, same array contents
- Preset dropdowns across Kobold, NovelAI, OpenAI, and TextGen populate correctly
- Themes, moving UI presets, quick replies, instruct/context/sysprompt/reasoning presets, and world list load in settings surfaces

## Documentation

Updated:
- `.docs/tech/startup-app-ready-optimization.md` — added `src/endpoints/settings-cache.js` to primary files list; added "Settings-cache for /api/settings/get" section describing cache design, single-flight semantics, and invalidation touchpoints

## Doc ID Contract

- Supports `feature.startup_bootstrap` by shortening one remaining server-side blocker in the startup-visible `getSettings.fetch` stage
- No new user-visible semantic feature introduced
- Cache helper recorded in `.docs/tech/startup-app-ready-optimization.md` as stability-sensitive

## Boundaries

- Cache is per-process and in-memory only, not cross-process or persistent
- Only directory-backed payloads are cached; `settings.json` itself remains a normal read
- Out-of-band file edits that bypass EmberDesk write paths are not guaranteed to invalidate immediately
- No LRU eviction, no TTL, and no hash-based freshness in this slice
- No HTTP caching headers (ETag/304) added to this route