# Settings Get Async Concurrent

## Intent & Core Flow

Reduce the startup-visible latency of `POST /api/settings/get` by removing its serialized synchronous directory walks and replacing them with concurrent async reads plus best-effort reuse of already-parsed directory payloads when EmberDesk itself has not changed those directories since the last successful read.

Primary trigger: browser startup calls `getSettings.fetch` from `public/script.js` before `getSettings.applyCore`, and ordinary settings refreshes reuse the same route.

Happy path:

1. The browser calls `POST /api/settings/get`.
2. The server reads `settings.json`, preset directories, JSON-list directories, and `worlds` using `fs.promises` work scheduled concurrently instead of one sync loop at a time.
3. For a directory already cached in-process and not invalidated by a known EmberDesk write path, the server reuses the parsed result instead of rereading every file.
4. The response body matches current keys, ordering, and per-field values, so startup behavior and settings UI consumers do not change.
5. The startup path reaches `getSettings.applyCore` sooner because the route no longer blocks the main event loop on serialized disk I/O.

## Scope / Out of Scope

### In Scope

- Rewrite the preset and parsed-directory helpers in `src/endpoints/settings.js` from sync filesystem APIs to async `fs.promises` usage.
- Execute the independent directory reads inside `router.post('/get')` concurrently, including:
  - `koboldAI_Settings`
  - `novelAI_Settings`
  - `openAI_Settings`
  - `textGen_Settings`
  - `themes`
  - `movingUI`
  - `quickreplies`
  - `instruct`
  - `context`
  - `sysprompt`
  - `reasoning`
  - `worlds`
  - root `settings.json`
- Add an in-process cache for directory-backed payloads used by `/api/settings/get`.
- Invalidate that cache explicitly after successful EmberDesk writes to the affected directory.
- Keep response JSON shape and compatibility stable for all current callers.

### Out Of Scope

- Splitting `/api/settings/get` into smaller routes.
- HTTP caching such as ETag or `304`.
- Changing `/api/settings/save` behavior or adding cache for `settings.json` itself.
- Cross-process or persistent cache sharing.
- New plugin APIs or a generic cache framework for unrelated endpoints.
- Opportunistic eviction policies such as LRU for this slice.

### First Shippable Slice

The first shippable slice is:

- concurrent async reads for all current `/api/settings/get` sources
- one in-process directory cache keyed by absolute directory path
- explicit invalidation from the known EmberDesk write paths that mutate those directories

No additional optimization layer is required for approval of this slice.

## Edge Rules / Acceptance

- `POST /api/settings/get` returns the same top-level keys in the same order as today.
- `settings`, preset arrays, preset-name arrays, `world_names`, and parsed directory payloads remain behaviorally identical to current success responses.
- Invalid JSON files that are currently skipped remain skipped after the rewrite.
- Invalid JSON files that currently emit a warning from `readPresetsFromDirectory` still emit a warning on that path.
- If `settings.json` cannot be read, the route still returns `500`.
- If one preset or parsed file is unreadable or unparsable, only that item is skipped; the rest of the response still succeeds, matching current behavior.
- Concurrent callers for the same uncached directory must wait on one rebuild task, not trigger duplicate rebuilds for that same directory.
- After a successful EmberDesk write to a cached directory, the next `/api/settings/get` response reflects the new on-disk contents without requiring server restart.
- A request made before any invalidating write may reuse cached parsed payloads from a prior successful request in the same process.
- Out-of-band file edits that bypass EmberDesk write paths are not guaranteed to invalidate immediately in this slice; the design only promises freshness after covered EmberDesk mutations.
- Startup behavior remains compatible with the current `getSettings.fetch` -> `getSettings.applyCore` flow in `public/script.js`.

## Architecture / Constraints

- Keep the current Express router and jQuery frontend contract unchanged.
- Prefer deletion/simplification over a general-purpose cache abstraction. A single helper module for `/api/settings/get` is enough.
- The cache key is the absolute directory path. That already partitions entries by user because user directories are distinct absolute paths.
- The cache only applies to directory-backed payloads. `settings.json` remains a normal read in this slice.
- Cache freshness for v1 is driven by explicit invalidation from EmberDesk-controlled write paths, not by per-request directory stat polling. This avoids paying extra stat work on every steady-state read and keeps the design aligned with the startup-latency goal.
- To avoid duplicate rebuild work, each cache entry may hold one in-flight rebuild promise that concurrent readers await.
- The route rewrite must preserve existing sort behavior:
  - preset-name lists stay locale-sorted by filename
  - parsed-directory arrays stay filename-sorted
  - `world_names` stays locale-sorted by basename
- The implementation must not assume parent-directory `mtime` changes are reliable enough to replace explicit invalidation.
- `checkForNewContent()` is part of the mutation surface because it seeds user directories under startup and account-reset flows. The design must treat those seeded directories as invalidation targets when they overlap `/api/settings/get` inputs.
- Environment flags are not required for the first slice. If debugging bypass is added during implementation, it must stay optional and must not become a prerequisite for correctness.

## Data / Integrations

### Read Surfaces

- `src/endpoints/settings.js`
  - `readAndParseFromDirectory`
  - `readPresetsFromDirectory`
  - `router.post('/get')`
- `public/script.js`
  - startup stage `getSettings.fetch`
  - startup stage `getSettings.applyCore`

### Directory Payload Categories

- Preset JSON string payloads plus names:
  - `koboldAI_Settings`
  - `novelAI_Settings`
  - `openAI_Settings`
  - `textGen_Settings`
- Parsed JSON object arrays:
  - `themes`
  - `movingUI`
  - `quickreplies`
  - `instruct`
  - `context`
  - `sysprompt`
  - `reasoning`
- Name-only list:
  - `worlds`

### Required Invalidation Touchpoints

Known EmberDesk write paths that mutate `/api/settings/get` directory inputs and therefore must invalidate the matching cache entry after successful mutation:

- `src/endpoints/presets.js`
  - `/save`
  - `/delete`
- `src/endpoints/themes.js`
  - `/save`
  - `/delete`
- `src/endpoints/moving-ui.js`
  - `/save`
- `src/endpoints/quick-replies.js`
  - `/save`
  - `/delete`
- `src/endpoints/worldinfo.js`
  - `/delete`
  - `/import`
  - `/edit`
- `src/endpoints/content-manager.js`
  - `checkForNewContent()` seeding into user targets for `WORLD`, `THEME`, `KOBOLD_PRESET`, `OPENAI_PRESET`, `NOVEL_PRESET`, `TEXTGEN_PRESET`, `INSTRUCT`, `CONTEXT`, `MOVING_UI`, `QUICK_REPLIES`, `SYSPROMPT`, and `REASONING`

### Cache Data Shape

The cache entry shape only needs the minimum state required to make reuse and single-flight possible:

- absolute directory path
- cached response payload for that directory
- one optional in-flight rebuild promise

Additional metadata is allowed only if implementation needs it for correctness, but the design does not require a hash, mtime signature, or eviction index for v1.

### Compatibility

- The route remains per-process and in-memory only.
- No response schema changes are allowed.
- No client-side fetch contract changes are allowed.

## Verification

- Automated response-equivalence test for `/api/settings/get` against a seeded user fixture:
  - current sync behavior fixture
  - new async behavior fixture
  - same keys, same array contents, same ordering
- Automated invalidation test:
  - first read warms cache
  - mutate one preset/theme/world/etc. through a covered write path
  - second read returns updated content
- Automated single-flight test:
  - multiple concurrent `/api/settings/get` requests share one directory rebuild per directory
- Automated error-path test:
  - unreadable or invalid file is skipped the same way current code skips it
- Unit test command surface:
  - `cd tests && npm run test:unit -- settings`
  - or the equivalent targeted Jest invocation added for the new settings-cache coverage
- Startup measurement:
  - run `node scripts/startup-performance-runner.mjs --url http://127.0.0.1:8000/`
  - compare `existing_server_browser_only` median `navigationToAppReadyMs` before and after on the same machine/profile
- Manual verification:
  - startup reaches the main shell normally
  - preset dropdowns across Kobold, NovelAI, OpenAI, and TextGen still populate correctly
  - Themes, moving UI presets, quick replies, instruct/context/sysprompt/reasoning presets, and world list still load in settings surfaces

## Doc ID Contract

- This slice supports `feature.startup_bootstrap` by shortening one remaining server-side blocker in the startup-visible `getSettings.fetch` stage.
- No new user-visible semantic feature is introduced by this slice.
- If a dedicated helper such as `src/endpoints/settings-cache.js` is added, record its stability-sensitive role in `.docs/tech/startup-app-ready-optimization.md` after delivery.

## References

- `src/endpoints/settings.js`
- `src/endpoints/presets.js`
- `src/endpoints/themes.js`
- `src/endpoints/moving-ui.js`
- `src/endpoints/quick-replies.js`
- `src/endpoints/worldinfo.js`
- `src/endpoints/content-manager.js`
- `public/script.js`
- `.docs/tech/startup-app-ready-optimization.md`
- `.docs/db/features/startup-bootstrap.md`
- Inference: the startup-facing value of this slice is primarily the reduction of serialized filesystem work inside `getSettings.fetch`, not a user-visible settings-flow change.
