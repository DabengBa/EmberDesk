# Interaction Performance Indexing

## Module Responsibility

This document covers EmberDesk's historical interaction-performance work for the character list hot path and the current retired state of the legacy character-index sidecar.

Primary files:

- `src/endpoints/character-index.js` (retired from normal runtime; retained as historical/helper-level proof)
- `src/derived-cache-sqlite.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/character-import-service.js`
- `src/endpoints/characters.js`
- `src/endpoints/chats.js`
- `src/interaction-performance-report.js`
- `public/script.js`
- `public/scripts/character-list-state.js`
- `public/scripts/character-list-render-state.js`
- `public/perf-harness.html`
- `scripts/interaction-performance-runner.mjs`

Current status:

- normal runtime no longer opens, refreshes, dirty-marks, deletes, or reports `_cache/character-index.sqlite`
- `POST /api/characters/all`, `/list`, and `/get` read from canonical SQLite when the canonical flags and audit gate allow it, otherwise they fall back directly to compatibility files
- character write/import/chat and World Info delete-preflight/cascade paths no longer use `character-index.js` as an accelerator, dependency scanner, or second authority lane
- deleting `<user root>/_cache/character-index.sqlite` cannot lose user data and should not affect normal character-library behavior
- `src/endpoints/character-index.js` remains only as a retired helper surface for historical tests and interaction-performance report compatibility until a later cleanup deletes or archives it

The historical interaction-performance slice originally aimed to:

- avoid reparsing every character PNG and rescanning every chat directory on each `POST /api/characters/all`
- reuse a fresh per-character cached `full_json` on `POST /api/characters/get` when the indexed row still matched the source PNG
- keep canonical character and chat files on disk
- reduce the visible lag after character deletion by removing the success-path full character-list refetch
- reduce avoidable full-list redraws during ordinary character-library page changes when the next visible page can be reconciled safely
- keep the indexed fast path self-healing when derived rows or SQLite state became inconsistent
- add a reproducible local A/B runner that can prove whether the current SQLite slice is helping enough to justify its maintenance cost

This tech note now treats the index details below as historical/helper-level context. Current runtime ownership lives in `src/endpoints/character-read-service.js`, `src/endpoints/character-write-service.js`, `src/endpoints/character-import-service.js`, `src/endpoints/chats.js`, and `src/endpoints/worldinfo.js`, none of which use `_cache/character-index.sqlite` as a normal path.

Separate from the SQLite slice, EmberDesk now also applies a short browser cache policy on non-Firefox `/thumbnail` responses:

- `Cache-Control: private, max-age=3600, must-revalidate`

That thumbnail-header change is intentionally scoped to repeat avatar/persona/background image loads. It does not change canonical storage, SQLite behavior, or startup payload size, and Firefox continues using the existing image `no-store` workaround path.

Separate from SQLite and thumbnail HTTP caching, EmberDesk now also ships a lower default JPEG thumbnail quality:

- `default/config.yaml` now sets `thumbnails.quality: 85`
- `src/endpoints/thumbnails.js` now uses `85` as the runtime fallback when the config key is absent

That quality-tuning slice is intentionally narrow:

- only newly generated JPEG thumbnails pick up the lower default
- installs that already carry an explicit `thumbnails.quality` value keep that override unchanged
- already-cached thumbnail files remain on disk until an operator clears the relevant thumbnail folders and lets normal browsing regenerate them
- PNG mode still ignores JPEG quality settings entirely

Separate from both SQLite and thumbnail HTTP caching, EmberDesk now also marks list-style avatar templates with:

- `loading="lazy"`
- `decoding="async"`

That front-end slice is intentionally narrow:

- it applies to template-owned list surfaces such as character rows, inline avatar strips, group member/group collage avatars, and past-chat rows
- it does not change thumbnail URLs, cache-buster behavior, or active-chat avatar rendering
- it reduces offscreen image fetch/decode work through native browser behavior rather than new JS scheduling logic

Separate from SQLite, thumbnail HTTP caching, and lazy image fetch behavior, EmberDesk now also adds a themed placeholder paint color to the shared avatar image rule:

- `.avatar img { background-color: var(--SmartThemeBlurTintColor); }`

That CSS-only slice is intentionally narrow:

- it affects the shared avatar `<img>` paint surface instead of wrapper elements
- it reduces visible white or transparent flashes while avatar thumbnails are still loading or decoding
- opaque thumbnails fully cover the placeholder after paint, while transparent avatar regions may continue to reveal the tint by design
- it does not alter thumbnail routing, request timing, cache-busters, or runtime state

Separate from SQLite, thumbnail HTTP caching, lazy image fetch behavior, placeholder paint, and JPEG quality tuning, EmberDesk now also pre-generates avatar and persona thumbnails immediately after successful source-image writes:

- shared character writes now invalidate an existing avatar thumbnail before overwriting the canonical PNG, then start `generateThumbnail(..., true, false)` in fire-and-forget mode
- the `/duplicate` character path is covered explicitly even though it bypasses the shared character-write helper
- persona uploads now start `generateThumbnail(..., true, null)` after the canonical persona image lands, preserving the existing overwrite invalidation and cache-buster behavior
- mutation success responses do not wait for thumbnail pregeneration to finish
- if pregeneration fails or loses a race with a very fast follow-up request, the existing `/thumbnail` route remains the fallback source of truth for derived regeneration

Separate from the read-side character route service, EmberDesk now also routes single-card character writes through `src/endpoints/character-write-service.js`:

- `/api/characters/create` delegates canonical card formatting, target avatar naming, chats-directory creation, and optional upload cleanup to `createCharacterCard`
- `/api/characters/edit` delegates metadata-only writes with `shouldRegenerateThumbnail: false`, replacement-avatar upload cleanup, and cache busting to `editCharacterCard`
- the related single-card `/api/characters/rename` path delegates old-card read/update, chats-directory copy/remove, and old avatar deletion to `renameCharacterCard`
- routes keep request validation and legacy HTTP response mapping; the service owns write-side effect ordering through explicit dependencies that are covered by `tests/character-write-service.test.js`

Separate from the single-card write service, EmberDesk now also routes `POST /api/characters/import` through `src/endpoints/character-import-service.js`:

- the route still owns request/file validation, upload cleanup, and HTTP `{ file_name }` / `400 { error: true }` response mapping
- the import coordinator now owns format dispatch across PNG / JSON / YAML / CHARX / BYAF inputs and empty-result normalization
- the coordinator keeps imported cards file-backed or canonical-projected according to the active storage flags without refreshing the retired derived index

## Architecture And Constraints

- Legacy compatibility files remain:
  - character cards in `data/<user>/characters/*.png`
  - chats in `data/<user>/chats/**`
- The retired SQLite file is derived state only:
  - `<user root>/_cache/character-index.sqlite`
- The first slice preserves both existing `/api/characters/all` payload modes:
  - full objects when `performance.lazyLoadCharacters=false`
  - shallow rows when `performance.lazyLoadCharacters=true`
- `POST /api/characters/get` stays file-compatible for fallback reads and no longer consults `_cache/character-index.sqlite`.
  - when canonical DB-first reads are enabled and audit-clean, the route can read canonical rows
  - when canonical rows are blocked, missing, stale, or disabled, the route falls back directly to compatibility files
- The retired index does not replace the existing `DiskCache`.
  - `DiskCache` still accelerates PNG-to-JSON extraction through `readCharacterData()`
- no normal character route now uses the SQLite sidecar as an accelerator or fallback
- The indexed fast path is retired at runtime.
  - `node:sqlite` availability can still matter for canonical SQLite and helper-level tests
  - it no longer decides whether character reads take an indexed sidecar path
- Historical benchmarking compared indexed and filesystem paths in the same runtime.
  - the measurement runner can still use `EMBERDESK_CHARACTER_INDEX_MODE=force_on|force_off` for helper/report compatibility
  - `force_off` disables the historical SQLite fast path without changing the Node build
  - `force_on` still requires actual `node:sqlite` support; it is not a fake mock path
- Chat save stays lightweight.
  - when the canonical chat-stats flag is enabled, character chat mutations update `character_chat_stats`
  - file-backed chat mutations still invalidate canonical audit state as needed
  - no chat route dirty-marks the retired character-index sidecar
- Historical helper failures are isolated to helper-level tests or perf-report compatibility and should not affect normal character-list availability.

## Core Implementation

### Retired character index storage

`src/endpoints/character-index.js` still contains the historical per-user SQLite sidecar implementation with:

- `meta`
  - `schema_version`
- `characters`
  - `avatar`
  - `full_json`
  - `shallow_json`
  - `source_mtime_ms`
  - `source_size`
  - `source_world_name`
  - `source_world_mtime_ms`
  - `source_world_size`
  - `chat_stats_dirty`

The retired helper module:

- delegates `node:sqlite` feature detection to `src/derived-cache-sqlite.js`
- delegates cached `DatabaseSync` handle lifecycle to `src/derived-cache-sqlite.js`
- exposes disposal helpers for tests, but `src/server-main.js` no longer opens, logs, or disposes character-index databases during normal startup/shutdown
- resets cached handles through the helper when structural index operations fail
- recreates derived rows when:
  - the row is missing
  - the source PNG `mtime` changes
  - the source PNG size changes
  - the row must be fully rebuilt for another source-of-truth reason
- recomputes `chat_size` and `date_last_chat` in-place when `chat_stats_dirty=1`
- removes rows whose source avatar files no longer exist
- skips and cleans up corrupt payload rows instead of failing the entire request
- sorts final rows in JavaScript with `Intl.Collator` instead of relying on SQLite `COLLATE NOCASE`

### Historical cached payloads

The retired SQLite sidecar historically cached per-character derived payloads for `POST /api/characters/all`.

Shared SQLite lifecycle details live in [Derived Cache SQLite Helper](derived-cache-sqlite.md). The helper owns feature detection, PRAGMA setup, cached handle lifecycle, schema-version reset plumbing, status reporting, and reset-count circuit breaking. `character-index.js` remains the owner of the retired helper schema, payloads, freshness checks, and fallback rules used by historical proof.

Per [ADR-0009](../adr/0009-derived-cache-sqlite-drizzle-decision.md), this sidecar used the handwritten `node:sqlite` path. Drizzle was reviewed and rejected for that derived-cache scope; the decision remains historical context rather than a reason to keep the sidecar in normal runtime.

It is not just a tiny row index with avatar and title fields.

Cached content in `characters`:

- `full_json`
  - the full object produced by `processCharacter(avatar, directories, { shallow: false })`
  - includes the embedded `json_data` string extracted from the PNG card
  - includes derived list-facing fields such as:
    - `avatar`
    - `chat`
    - `fav`
    - `tags`
    - `date_added`
    - `create_date`
    - `date_last_chat`
    - `chat_size`
    - `data_size`
- `shallow_json`
  - the reduced object produced by `toShallow(fullPayload)`
  - used when `performance.lazyLoadCharacters=true`
- invalidation and refresh metadata
  - `source_mtime_ms`
  - `source_size`
  - `source_world_name`
  - `source_world_mtime_ms`
  - `source_world_size`
  - `chat_stats_dirty`

What this slice does not cache in SQLite:

- `POST /api/characters/get` as a new source of truth independent from the PNG file
- chat message bodies
- world info lists or entries
- recent chats
- general extension or settings state

So the precise answer is:

- historically, by usage scope, it existed for character-list responses and safe single-character full-payload reuse
- historically, by stored content, it stored both the full `/api/characters/all` payload and the shallow payload for each character, not only a few visible list columns
- currently, it is retired from normal runtime and should not be treated as an active response source

### Current `/api/characters/all` path

`src/endpoints/characters.js` routes `POST /api/characters/all` through `src/endpoints/character-read-service.js`. The service now returns canonical rows when the canonical read gate is available and audit-clean, otherwise it falls back directly to compatibility files. It does not call the retired derived sidecar in either mode, and the Express route unwraps the internal snapshot envelope before sending the unchanged array response.

Build source for each row:

1. `processCharacter(avatar, directories, { shallow: false })`
2. `toShallow(fullPayload)`
3. source file stat (`mtimeMs`, `size`)

The current response still satisfies both existing list modes:

- full mode returns full route-compatible character objects
- lazy/shallow mode returns shallow route-compatible rows

Failure behavior:

- if canonical read is unavailable, blocked, or stale, the route falls back to compatibility files
- this keeps the page usable even when canonical storage is unavailable, while retired sidecar availability is irrelevant to route success
- in interaction perf mode, the route also emits:
  - `X-EmberDesk-Interaction-Path`
  - `Server-Timing: route;dur=...`
  - this keeps benchmark-only path evidence out of the JSON contract

### Character read service boundary

`src/endpoints/character-read-service.js` owns read coordination for:

- `POST /api/characters/all`
- `POST /api/characters/list`
- `POST /api/characters/get`

The service is route-adjacent instead of storage-owned:

- `characters.js` still owns Express routes, middleware, status mapping, JSON response bodies, and `applyInteractionPerfHeaders()`
- `character-index.js` no longer participates in this service boundary during normal runtime
- `processCharacter()` and card conversion remain in the character endpoint boundary instead of moving into the service

The service returns an internal result envelope such as:

- `result.mode: 'snapshot'`
- `result.data`
- `interactionPath`
- `latencyHint`

That envelope is not part of the HTTP JSON contract. Route handlers unwrap `result.data` before responding, so existing browser and extension callers continue to receive the same arrays or character objects.

The service accepts future read context fields for `filter` and `pagination`, but this delivered slice intentionally ignores them. Those fields exist only to keep the boundary ready for later character-library search, filtering, virtual scrolling, command-palette, or optimistic-update slices without bypassing the read service.

In canonical DB-first read mode, the service now uses the derived character index as neither a canonical source nor a fallback authority. If canonical rows are blocked, missing, or stale, recovery is direct compatibility-file fallback.

### Current `/api/characters/get` path

`src/endpoints/characters.js` routes `POST /api/characters/get` through `src/endpoints/character-read-service.js`. The current compatibility fallback is direct file-backed parsing:

1. validate the avatar path
2. confirm the PNG still exists
3. read the current file stat once
4. read canonical rows when DB-first reads are enabled and audit-clean, or call `processCharacter(..., { shallow: false })` directly when fallback is required
5. return the route-compatible payload without refreshing or upserting `_cache/character-index.sqlite`

This keeps the route file-authoritative:

- missing files still return `404`
- stale or corrupt sidecar rows cannot override the canonical or PNG-backed read because the route never consults them
- out-of-band chat cleanup is represented through canonical chat stats when enabled, or through direct compatibility-file fallback and repair tooling when not
- legacy world-linked cards are read from the compatibility file path during fallback instead of reusing cached `full_json`
- in interaction perf mode, `/get` emits path and route-duration headers so the runner can verify it exercised the canonical or filesystem path it claims to compare

The service does not revive the retired index after a canonical miss. The recovery path is direct compatibility-file fallback so canonical mode never gains a second hidden authority lane.

### Interaction A/B runner

`scripts/interaction-performance-runner.mjs` is the reproducible benchmark entry point for this slice.

Core design:

- starts isolated local servers with temporary per-run data roots
- seeds deterministic character PNGs and chat files
- keeps user auth simple by staying in the default single-user mode
- uses `public/perf-harness.html` as an inert same-origin page so benchmark requests do not accidentally boot the full app and prewarm `/api/characters/all`
- preserves historical `force_on` and `force_off` variants only for helper/report compatibility; normal route samples should observe canonical or filesystem paths, not indexed route paths
- validates route-path headers before accepting a sample
- rejects pair summaries when on/off payloads are not semantically equivalent

Measured default scenarios:

- `characters_all_first_build`
- `characters_all_warm_repeat`
- `characters_get_warm_repeat`
- `characters_all_after_chat_dirty`
- `character_delete_refresh_ui`
- `character_library_first_interactive`
- `character_library_filter_response`
- `character_library_pagination_scroll`

The first four scenarios use `public/perf-harness.html` to measure API route behavior without booting the full app. The delete and character-library scenarios intentionally open the full app with `?emberdesk_perf_hooks=1` so the runner can measure the browser-visible list path.

User-perceived character-library metrics:

- `firstListItemVisibleMs`
- `firstListItemClickableMs`
- `characterPageLoadedLagMs`
- `filterInputToPageLoadedMs`
- `filterInputToBusyClearMs`
- `paginationScrollRestored`

`firstListItemClickableMs` means the first visible character row accepted a click and reached the application-owned selected-row state (`.is_active`). It is not just a synthetic DOM listener check.

The search metric is gathered through a perf-only `measureCharacterSearchForPerf()` hook exposed only when `emberdesk_perf_hooks=1` is present. It exercises the same `entitiesFilter` and `printCharacters()` render path as the UI while avoiding duplicated hidden search inputs in the DOM from making the runner target the wrong field. The timing intentionally excludes the UI debounce delay; it measures filter/render response after the search command is applied.

Artifact contract:

- `artifacts/interaction-perf/<timestamp>/report.json`
- `artifacts/interaction-perf/<timestamp>/report.md`
- `artifacts/interaction-perf/<timestamp>/samples.json`
- `artifacts/interaction-perf/<timestamp>/config.json`
- scenario screenshots

`report.json` can include a `derivedCache` section, and `report.md` renders the same information under "Derived Cache Observability". The section is retained for historical sidecar observability and records sanitized character-index sidecar status when helper-level status is collected:

- variant name such as `sqlite_on` or `sqlite_off`
- mode such as `force_on`, `force_off`, or `auto`
- whether the sidecar was supported, whether the sidecar handle was open, and whether an indexed route path was observed
- schema version and reset count
- fallback or disabled reason such as `force_off`, `unsupported`, or `reset_threshold_exceeded`

This derived-cache observability section intentionally omits `dbPath`, data-root paths, usernames, character filenames, and other user-specific filesystem details. Other report sections still include synthetic benchmark payload summaries, such as sample avatar names, for parity debugging. Character routes no longer emit `X-EmberDesk-Character-Index-Status`; the runner can still collect helper-level status directly for retired-sidecar report compatibility, while `indexedPathObserved=false` is expected for normal route samples because the service no longer consults the sidecar. This is diagnostic evidence only; it does not add a health endpoint and does not change `/api/characters/all` or `/api/characters/get` response bodies.

Raw runner artifacts are local evidence and are not committed by default. Durable docs should record the command, runtime, scenario set, warnings, and the local artifact path used during the delivery.

Important reliability controls:

- baseline data is cloned per pair so index files and dirty-state mutations do not leak between variants
- cloned roots preserve timestamps so file-backed aggregates stay comparable
- the benchmark config sets `skipContentCheck: true` so default content injection does not pollute the synthetic dataset
- the benchmark config explicitly disables user accounts and extensions so full-app proof stays in single-user mode and does not include extension startup noise
- the seeded baseline includes the default transparent background asset so full-app runs do not produce synthetic 404 console errors
- dirty-chat benchmark writes a fixed payload and forces a fixed chat-file `mtime` through a perf-only hook in `src/endpoints/chats.js`, avoiding false mismatches caused by variant run time
- full-app character-library scenarios honor `--repeats` just like route scenarios, so app UX medians are based on the requested sample count rather than a single hidden sample
- perf-only search measurement uses a bounded wait for `CHARACTER_PAGE_LOADED`; missing events become invalid runner evidence instead of hanging the browser session
- resize-time autocomplete adjustment checks the jQuery UI instance before reading its widget, avoiding early full-app proof failures while widgets are still initializing
- semantic comparison ignores fields that are not stable enough for same-machine A/B parity, such as humanized chat label text and scenario timing metrics, while still checking the fields that matter for correctness

Current local proof command:

```bash
node scripts/interaction-performance-runner.mjs --profile small --scenario suite --repeats 2 --pairs 1
```

On the 2026-06-05 Node.js 26.3.0 proof run, all eight scenarios produced `validPairCount: 1`, `invalidPairCount: 0`, and top-level `warnings: []`. The small seeded profile showed the expected shape: first indexed build paid rebuild cost, warm list reads favored SQLite, warm `/get` was effectively neutral at this scale, and full-app UX metrics produced first-row, filter, and pagination evidence without claiming skeleton/loading UX optimization.

### Mutation consistency

Character mutations in `src/endpoints/characters.js` no longer refresh or delete indexed rows after successful canonical or compatibility file changes. The affected normal runtime paths are:

- create
- rename
- edit
- edit-avatar
- edit-attribute
- merge-attributes
- delete
- import
- duplicate

Bulk `merge-attributes` updates the affected cards without issuing sidecar rebuild work.

Character-chat mutations in `src/endpoints/chats.js` no longer mark sidecar chat-derived aggregates dirty after successful:

- save
- rename
- delete
- import

Canonical chat-stats mode updates `character_chat_stats` directly for character chats. Compatibility fallback stays file-backed, and external drift is repaired through the canonical operator path rather than by dirty-marking `_cache/character-index.sqlite`.

Import still normalizes route results and compatibility filenames, but it does not refresh the retired derived row.

### Delete-flow UI update

`public/script.js` no longer calls `getCharacters()` after a successful character delete.

Instead it now:

1. removes deleted avatars from the in-memory `characters` array through `public/scripts/character-list-state.js`
2. refreshes groups
3. attempts a state-driven incremental reconcile for the ordinary unfiltered single-delete path
4. falls back to `printCharacters(true)` when the current state is complex or the incremental patch cannot be completed safely

This preserves the existing chat reset semantics while avoiding a second full character-list request in the delete success path.

For the safe incremental path, `deleteCharacter()` enters the delete-reconcile suppression window before `closeCurrentChatForDelete()` can switch the menu or emit chat-change callbacks. `removeCharacterFromUI()` then captures a pre-delete entity snapshot, cancels a pending delayed character print, refreshes canonical character/group state, then calls the local delete reconcile helper. The helper compares before/after entity snapshots, removes the deleted visible row, reuses existing DOM nodes where possible, fills the current page from the after-delete render plan, rewrites visible character row identity attributes, updates the pagination model/text, refreshes hotswap/persona avatar surfaces, and emits `CHARACTER_PAGE_LOADED` even though the list was not fully reprinted.

The fallback boundary is intentionally conservative. Multi-delete, active search/tag filters, bulk edit mode, bogus-folder drilldown, pending list prints, missing-before entities, still-present deleted entities, and page-clamp changes use the existing full-refresh path instead of leaving a partial DOM patch behind. A generation guard prevents non-full `printCharacters(false)` calls and pagination callbacks from clearing the list while delete reconcile is in progress, and also rejects non-full prints that started before the latest delete-reconcile generation completed. New user-triggered list changes after the delete are not held behind a timer, and explicit full-refresh fallback remains allowed.

The delete flow also cancels `saveCharacterDebounced` at the start of `deleteCharacter()`. This prevents a pending delayed edit save from submitting after the user has already committed a destructive delete.

Character edit completion now guards the post-save refresh with `shouldRefreshCharacterAfterEdit(characters, editedAvatar)`. The refresh only runs when the submitted avatar key is still a non-empty string and still exists in the local `characters` array. If a delete already removed that avatar locally, the edit response returns without calling `getOneCharacter()`, so stale edit completion cannot reinsert the deleted card into the visible list.

The selected-character title area now has a matching stale-index guard. `select_selected_character(chid, { switchMenu })` first resolves `characters[chid]`; if the character is missing, it returns `false` and only switches back to the character library when `switchMenu` is true. The header click path also checks `this_chid !== undefined && characters[this_chid]` before opening the editor. This keeps active-character deletion from turning a stale array index into a `characters[chid].name` read.

Temporary Assistant chats now have a small workspace status binding rather than relying only on the delete confirmation warning. `setCharacterName()` calls `syncTemporaryChatStatus()`, temporary Assistant chat creation explicitly shows `#temporary_chat_status`, and selecting a real character clears it. This binding is UI state only; it does not change chat persistence or delete API behavior.

The delete flow now also uses a dedicated preflight helper before the delete request:

- `closeCurrentChatForDelete()` reuses the existing save/generation guards and low-level chat cleanup
- if generation is still active, `closeCurrentChatForDelete()` shows the existing stop-generation notice and returns without running destructive cleanup
- the helper suppresses the next welcome-screen `CHAT_CHANGED` hydration attempt, then still emits a lightweight pre-delete `CHAT_CHANGED`
- this preserves existing chat-scoped cleanup listeners such as TTS/gallery teardown without blocking the delete request on welcome-screen recent-chat hydration
- the helper still reselects the characters view so the visible landing state matches the old flow

The detailed client-side state rules for stable delete keys, edit-refresh suppression, bulk-selection DOM sync, and delete-reconcile fallback are captured in [character-list-state-flow](../logic-description/character_list_state_processing_flow.md). User-facing delete and library behavior stay owned by [character-delete](../db/features/character-delete.md) and [character-library-panel](../db/features/character-library-panel.md).

Bulk-select mode now keeps the legacy checkbox affordance and row-level accessibility state synchronized through the same model. `enableBulkSelect()` marks character rows with `role="checkbox"`, `aria-selected="false"`, `aria-checked="false"`, and `aria-describedby="bulkSelectionHint"` while adding `.bulk_select_checkbox` inputs with matching `aria-checked` and description wiring. `syncBulkSelectionDomState()` updates both row and checkbox checked state after pagination, sorting, filtering, or redraws, and `BulkEditOverlay` mirrors the same state on direct selection toggles.

### Character-row string render fast path

`public/script.js` now replaces the per-row jQuery `clone()` / `.find()` / `.append()` path in `getCharacterBlock()` with a string-based builder for `type === 'character'` entities.

`buildCharacterRowHtml(item, id)` produces the full character-row HTML string using `escapeHtml` from `public/scripts/utils.js` for all text fields, preserving the same visible summary contract:
- `data-chid`, legacy `chid`, and `id="CharID${chid}"`
- avatar `src`/`alt`/title via `getThumbnailUrl`
- name text and title
- `is_fav` row class and `.ch_fav` value
- assistant badge removal for non-assistant rows
- creator-notes summary text or hidden state
- aux field text or hidden state
- inline tags using `tag_map` and `tags` arrays (collapsed form matching `printTagList` with `isCharacterList: true`)

Group rows, bogus-folder tag rows, back blocks, empty blocks, and hidden-count blocks keep their existing helper paths, so mixed entity pages still behave the same.

`updateCharacterRow(chid, patch)` provides row-local patching for safe metadata updates when:
- the row is currently visible in the DOM
- bogus-folder drilldown is not open
- the main character list has no active filters

Covered patch fields: favorite class/value, avatar thumbnail, creator-notes summary, aux field, inline character tags, and avatar URL text. When the safety gate is not met, the code falls back to the existing `printCharactersDebounced()` or `printCharacters(true)` full-refresh path.

Not covered by row-local patching: `renameCharacter()` flows, filtered list states, bogus-folder drilldown views, or pages where the row is not visible — all of these keep the existing full-refresh fallback.

### Character-list render-state foundation

`public/scripts/character-list-render-state.js` now owns the pure render-planning helpers that sit between `getEntitiesList({ doFilter: true })` and the DOM work inside `printCharacters()`.

The boundary is deliberately narrow:

- `getEntitiesList()` remains the only source for character, group, and bogus-folder tag ordering, filtering, and sorting semantics.
- `createCharacterListEntitySnapshot()` adds internal render metadata without changing entity order, ids, or row DOM identity.
- `getCharacterListEntityKey()` provides stable internal keys for future reconcile work:
  - character keys prefer `avatar`, because `chid` is an array index and can shift after deletion
  - group and tag keys use their stable ids
- `getCharacterListPageEntities()` selects the current page slice from a render snapshot while preserving the existing `Number(pageSize) || 1` and first-page fallback semantics.
- `createCharacterListPageRenderPlan()` describes the current page’s back-block, empty-block, display-count, and hidden-count decisions without rendering DOM.
- `createCharacterListPageReconcilePlan()` compares the mounted visible page against the next page and either returns ordered/reused/inserted/removed keys plus a render plan, or returns a named fallback reason such as `back-block`, `missing-entity-data`, or `duplicate-entity-key`.
- `getCharacterListPaginationRangeLabel()` keeps the navigator range formatting reusable while preserving the existing `1-14 / 14` style.

`renderCharacterListPage()` now uses that boundary for ordinary page changes:

- it builds the pure render plan for the next page
- snapshots the current filtered entity list
- attempts a page-level incremental reconcile unless `fullRefresh` was explicitly requested
- reuses existing DOM nodes by stable entity key, creates only missing rows, removes stale rows, and rewrites visible character row identity after moves or inserts
- falls back to the existing full-render path when a back block is active or the visible page keys are ambiguous

The shared DOM apply helper now serves both ordinary list updates and the delete-specific reconcile path. `printCharacters()` still owns the broader refresh side effects: tag filters, character/group tag selectors, pagination widget setup, full-render fallback, `CHARACTER_PAGE_LOADED`, hotswap favorites, and persona avatar list updates.

## Related Semantic IDs And Code Binding Points

Relevant semantic docs now live in `.docs/db/`:

- `page.chat_workspace`
- `feature.character_library_panel`
- `feature.character_delete`
- `term.character_card`

Stability-sensitive binding points:

- `POST /api/characters/all`
- `POST /api/characters/get`
- `POST /api/chats/save`
- `POST /api/chats/rename`
- `POST /api/chats/delete`
- `POST /api/chats/import`
- `performance.lazyLoadCharacters`
- `<user root>/_cache/character-index.sqlite` as retired disposable state
- `SCHEMA_VERSION` in `src/endpoints/character-index.js` for helper-level historical proof only
- `removeCharactersFromState()` in `public/scripts/character-list-state.js`
- `shouldRefreshCharacterAfterEdit()` in `public/scripts/character-list-state.js`
- `syncBulkSelectionDomState()` in `public/scripts/character-list-state.js`
- `setTemporaryChatStatus()` and `syncTemporaryChatStatus()` in `public/script.js`
- `select_selected_character()` in `public/script.js`
- selected-character title click handler in `public/script.js`
- `enableBulkSelect()` / `disableBulkSelect()` in `public/scripts/bulk-edit.js`
- `getCharacterListEntityKey()` in `public/scripts/character-list-render-state.js`
- `createCharacterListEntitySnapshot()` in `public/scripts/character-list-render-state.js`
- `getCharacterListPageEntities()` in `public/scripts/character-list-render-state.js`
- `createCharacterListPageRenderPlan()` in `public/scripts/character-list-render-state.js`
- `createCharacterDeleteReconcilePlan()` in `public/scripts/character-list-render-state.js`
- `syncCharacterListRowIdentity()` in `public/scripts/character-list-render-state.js`
- `cancelDebounce(saveCharacterDebounced)` at the start of `deleteCharacter()`

Current client-side state rules are documented in [Character List State Processing Flow](../logic-description/character_list_state_processing_flow.md).

## Performance And Caching

- Steady-state character-list reads now rely on canonical SQLite when enabled and audit-clean, or direct compatibility-file fallback when not.
- Chat-directory aggregate behavior is owned by canonical chat stats when the flag is enabled; the retired sidecar no longer dirty-marks or refreshes chat-derived list fields.
- The feature keeps `DiskCache` for PNG card extraction. `_cache/character-index.sqlite` is retired from normal runtime and should not be counted as an active performance dependency.
- Delete success avoids one extra `/api/characters/all` network roundtrip. In ordinary unfiltered single-delete cases it also avoids a full client-side list rebuild, while complex states still pay the existing full-refresh cost for correctness.
- Corrupt retired sidecar rows are irrelevant to normal route availability because current routes do not read them.
- The benchmark results should be interpreted per scenario, not as one global “SQLite is faster” claim.
  - historical first indexed builds could be materially slower because they paid index creation cost
  - current normal route samples should focus on canonical-vs-filesystem behavior rather than indexed-vs-filesystem behavior
- Delete-flow measurements now need two readings, not one:
  - pre-delete safety-path cost, which this slice reduced by suppressing welcome-screen hydration while still preserving the lightweight `CHAT_CHANGED` cleanup callback path
  - post-delete UI completion cost, which can still dominate large-profile reruns because `removeCharacterFromUI()` keeps its later refresh and `CHAT_CHANGED` work
