# Interaction Performance Indexing

## Module Responsibility

This document covers the first delivered slice of EmberDesk's interaction-performance work for the character list hot path.

Primary files:

- `src/endpoints/character-index.js`
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

The goal of this slice is narrow:

- avoid reparsing every character PNG and rescanning every chat directory on each `POST /api/characters/all`
- reuse a fresh per-character cached `full_json` on `POST /api/characters/get` when the indexed row still matches the source PNG
- keep canonical character and chat files on disk
- reduce the visible lag after character deletion by removing the success-path full character-list refetch
- reduce avoidable full-list redraws during ordinary character-library page changes when the next visible page can be reconciled safely
- keep the indexed fast path self-healing when derived rows or SQLite state become inconsistent
- add a reproducible local A/B runner that can prove whether the current SQLite slice is helping enough to justify its maintenance cost

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

- `/api/characters/create` delegates canonical card formatting, target avatar naming, chats-directory creation, optional upload cleanup, and post-write character-index refresh to `createCharacterCard`
- `/api/characters/edit` delegates metadata-only writes with `shouldRegenerateThumbnail: false`, replacement-avatar upload cleanup, cache busting, and post-write character-index refresh to `editCharacterCard`
- the related single-card `/api/characters/rename` path delegates old-card read/update, chats-directory copy/remove, old avatar deletion, old index deletion, and new index refresh to `renameCharacterCard`
- routes keep request validation and legacy HTTP response mapping; the service owns write-side effect ordering through explicit dependencies that are covered by `tests/character-write-service.test.js`

Separate from the single-card write service, EmberDesk now also routes `POST /api/characters/import` through `src/endpoints/character-import-service.js`:

- the route still owns request/file validation, upload cleanup, and HTTP `{ file_name }` / `400 { error: true }` response mapping
- the import coordinator now owns format dispatch across PNG / JSON / YAML / CHARX / BYAF inputs, empty-result normalization, and post-import `refreshCharacterIndexEntrySafe(..., 'import')`
- the coordinator keeps imported cards file-backed and only refreshes the derived index after canonical import success

## Architecture And Constraints

- Canonical user data remains file-backed:
  - character cards in `data/<user>/characters/*.png`
  - chats in `data/<user>/chats/**`
- The SQLite file is derived state only:
  - `<user root>/_cache/character-index.sqlite`
- The first slice preserves both existing `/api/characters/all` payload modes:
  - full objects when `performance.lazyLoadCharacters=false`
  - shallow rows when `performance.lazyLoadCharacters=true`
- `POST /api/characters/get` stays file-authoritative, but no longer has to reparse the PNG on every steady-state request.
  - when the indexed `full_json` row is present, the source PNG stat still matches, and related derived inputs are still valid, the route can return that cached payload directly
  - when the row is missing, stale, unreadable, or a linked dependency such as legacy world-info source data no longer matches, the route falls back to the existing file-backed parser and refreshes the row opportunistically
- The new index does not replace the existing `DiskCache`.
  - `DiskCache` still accelerates PNG-to-JSON extraction through `readCharacterData()`
  - the SQLite sidecar accelerates the character-list path and safe single-character steady-state reads
- The indexed fast path is optional at runtime.
  - when the active Node runtime exposes `node:sqlite`, EmberDesk enables the derived character index
  - when `node:sqlite` is unavailable, EmberDesk falls back to the previous filesystem-backed `/api/characters/all` path
- Benchmarking must compare both paths in the same runtime.
  - the measurement runner uses `EMBERDESK_CHARACTER_INDEX_MODE=force_on|force_off`
  - `force_off` disables the SQLite fast path without changing the Node build
  - `force_on` still requires actual `node:sqlite` support; it is not a fake mock path
- Chat save stays lightweight.
  - chat mutations mark character chat aggregates dirty
  - they do not rebuild the full indexed row on every save
- Derived index failures should degrade safely.
  - one corrupt indexed row must not break the whole character list
  - structural DB failures should reset the cached connection so the next request can rebuild derived state

## Core Implementation

### Character index storage

`src/endpoints/character-index.js` owns a per-user SQLite sidecar with:

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

The module:

- delegates `node:sqlite` feature detection to `src/derived-cache-sqlite.js`
- delegates cached `DatabaseSync` handle lifecycle to `src/derived-cache-sqlite.js`
- closes cached handles during server shutdown through the helper
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

### What is actually cached

The SQLite sidecar caches per-character derived payloads for `POST /api/characters/all`.

Shared SQLite lifecycle details live in [Derived Cache SQLite Helper](derived-cache-sqlite.md). The helper owns feature detection, PRAGMA setup, cached handle lifecycle, schema-version reset plumbing, status reporting, and reset-count circuit breaking. `character-index.js` remains the owner of character schema, payloads, freshness checks, and fallback rules.

Per [ADR-0009](../adr/0009-derived-cache-sqlite-drizzle-decision.md), this sidecar remains on the handwritten `node:sqlite` path. Drizzle was reviewed and rejected for the current derived-cache scope because it does not yet show net value over the existing rebuildable-sidecar design.

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

- by usage scope, mostly yes: this index exists for character-list responses and now also for safe single-character full-payload reuse
- by stored content, no: it stores both the full `/api/characters/all` payload and the shallow payload for each character, not only a few visible list columns

### `/api/characters/all` fast path

`src/endpoints/characters.js` now routes `POST /api/characters/all` through `src/endpoints/character-read-service.js`. The read service coordinates the index-first path when runtime support exists, and the Express route unwraps the internal snapshot envelope before sending the unchanged array response.

Build source for each row:

1. `processCharacter(avatar, directories, { shallow: false })`
2. `toShallow(fullPayload)`
3. source file stat (`mtimeMs`, `size`)

The indexed response can therefore satisfy either existing list mode directly from cached derived JSON:

- full mode returns cached `full_json`
- lazy/shallow mode returns cached `shallow_json`

Failure behavior:

- if indexed read or rebuild fails, the route logs the failure and falls back to the previous filesystem scan
- this keeps the page usable even when the derived DB is unavailable or corrupted
- if the failure indicates a broken cached DB handle or missing structural state, the next indexed request can reopen and rebuild instead of staying stuck in permanent fallback
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
- `character-index.js` still owns SQLite schema, freshness checks, row rebuilds, reset behavior, and derived-cache lifecycle calls
- `processCharacter()` and card conversion remain in the character endpoint boundary instead of moving into the service

The service returns an internal result envelope such as:

- `result.mode: 'snapshot'`
- `result.data`
- `interactionPath`
- `latencyHint`

That envelope is not part of the HTTP JSON contract. Route handlers unwrap `result.data` before responding, so existing browser and extension callers continue to receive the same arrays or character objects.

The service accepts future read context fields for `filter` and `pagination`, but this delivered slice intentionally ignores them. Those fields exist only to keep the boundary ready for later character-library search, filtering, virtual scrolling, command-palette, or optimistic-update slices without bypassing the read service.

### `/api/characters/get` index-first path

`src/endpoints/characters.js` now routes `POST /api/characters/get` through `src/endpoints/character-read-service.js`, which preserves the narrower safe reuse path:

1. validate the avatar path
2. confirm the PNG still exists
3. read the current file stat once
4. ask the index for a fresh `full_json` row for that exact avatar
5. return the cached payload only when:
   - the row exists
   - `source_mtime_ms` matches the current PNG `mtime`
   - `source_size` matches the current PNG size
   - current chat-directory aggregates still match the cached `chat_size` and `date_last_chat`
   - for legacy cards that derive `data.character_book` from an external world-info file, the cached row still matches the linked world file stat
   - if that linked world file was already absent when the row was last rebuilt, the cached "no linked world book available" state is still reusable until the file reappears
   - the cached payload parses successfully
6. otherwise, fall back to `processCharacter(..., { shallow: false })`
7. after a successful file-backed rebuild, re-stat the source PNG and refresh the indexed row opportunistically with the current file metadata

This keeps the route file-authoritative:

- missing files still return `404`
- stale or corrupt rows never override the canonical PNG-backed read
- out-of-band chat cleanup can still be reflected because `/get` recomputes chat aggregates before returning a cached row
- legacy world-linked cards revalidate the linked world-info file before reusing cached `full_json`
- when a previously linked world-info file is deleted, the first fallback rebuild updates the cached row to the new "world book unavailable" state so later steady-state reads do not keep reparsing the PNG unnecessarily
- `/get` fallback writes index metadata from a fresh post-parse file stat so the cached row does not end up with "new payload, old stat" skew when the PNG changes mid-request
- the index can speed up repeated steady-state full-character reads without becoming a second source of truth
- only row-read / structural SQLite failures reset the cached DB handle; non-DB dependency failures such as world-file lookup problems degrade through fallback without wiping the whole derived index
- in interaction perf mode, `/get` also emits path and route-duration headers so the runner can verify it really exercised the indexed or filesystem path it claims to compare

### Interaction A/B runner

`scripts/interaction-performance-runner.mjs` is the reproducible benchmark entry point for this slice.

Core design:

- starts isolated local servers with temporary per-run data roots
- seeds deterministic character PNGs and chat files
- keeps user auth simple by staying in the default single-user mode
- uses `public/perf-harness.html` as an inert same-origin page so benchmark requests do not accidentally boot the full app and prewarm `/api/characters/all`
- alternates SQLite `force_on` and `force_off` variants across pair runs
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

`report.json` now includes a `derivedCache` section, and `report.md` renders the same information under "Derived Cache Observability". The section records sanitized character-index sidecar status per scenario variant:

- variant name such as `sqlite_on` or `sqlite_off`
- mode such as `force_on`, `force_off`, or `auto`
- whether the sidecar was supported, whether the sidecar handle was open, and whether an indexed route path was observed
- schema version and reset count
- fallback or disabled reason such as `force_off`, `unsupported`, or `reset_threshold_exceeded`

The artifact intentionally omits `dbPath`, data-root paths, usernames, character filenames, and other user-specific filesystem details. For character route scenarios, the runner reads the sidecar runtime status from a perf-only `X-EmberDesk-Character-Index-Status` response header emitted only when `EMBERDESK_INTERACTION_PERF_MODE=1`; the header keeps `open` as sidecar runtime state, while `indexedPathObserved` records whether the sampled request used an indexed path. This is diagnostic evidence only; it does not add a health endpoint and does not change `/api/characters/all` or `/api/characters/get` response bodies.

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

Character mutations in `src/endpoints/characters.js` now refresh or delete indexed rows after successful canonical file changes:

- create
- rename
- edit
- edit-avatar
- edit-attribute
- merge-attributes
- delete
- import
- duplicate

Bulk `merge-attributes` refreshes all successfully updated avatars after the batch finishes.

Bulk refreshes now run with a bounded concurrency limit so derived-row rebuild pressure stays aligned with the surrounding bulk-update path.

Character-chat mutations in `src/endpoints/chats.js` now mark chat-derived aggregates dirty after successful:

- save
- rename
- delete
- import

This keeps `chat_size` and `date_last_chat` accurate on the next list read without making autosave synchronous-and-heavy.

Import now normalizes the avatar name before refreshing the derived row, so imported cards consistently update the index even when the internal file name comes back without `.png`.

This import refresh now happens through the route-adjacent coordinator instead of the route body itself, so the import side-effect order is testable without turning the derived index into a new source of truth.

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
- `<user root>/_cache/character-index.sqlite`
- `SCHEMA_VERSION` in `src/endpoints/character-index.js`
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

- Steady-state character-list reads no longer require one `processCharacter()` call per avatar when the runtime index is available and rows are clean.
- Chat-directory aggregate recomputation is deferred until the next character-list read after a relevant chat mutation.
- Dirty chat-stat refresh now uses the cached JSON payloads instead of reparsing the source PNG again.
- The feature keeps two distinct caches with different responsibilities:
  - `DiskCache` for PNG card extraction
  - SQLite sidecar for precomputed `/api/characters/all` payloads plus safe `/api/characters/get` full-payload reuse
- Delete success avoids one extra `/api/characters/all` network roundtrip. In ordinary unfiltered single-delete cases it also avoids a full client-side list rebuild, while complex states still pay the existing full-refresh cost for correctness.
- Corrupt derived rows are pruned opportunistically so steady-state reads can self-heal instead of degrading the whole list path.
- The benchmark results should be interpreted per scenario, not as one global “SQLite is faster” claim.
  - first build can be materially slower because it pays index creation cost
  - warm list reads are the main gain surface
  - warm `/get` gains are smaller because the route still validates file-backed freshness
- Delete-flow measurements now need two readings, not one:
  - pre-delete safety-path cost, which this slice reduced by suppressing welcome-screen hydration while still preserving the lightweight `CHAT_CHANGED` cleanup callback path
  - post-delete UI completion cost, which can still dominate large-profile reruns because `removeCharacterFromUI()` keeps its later refresh and `CHAT_CHANGED` work
