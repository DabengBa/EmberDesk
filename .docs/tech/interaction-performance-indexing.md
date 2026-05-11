# Interaction Performance Indexing

## Module Responsibility

This document covers the first delivered slice of EmberDesk's interaction-performance work for the character list hot path.

Primary files:

- `src/endpoints/character-index.js`
- `src/endpoints/characters.js`
- `src/endpoints/chats.js`
- `src/interaction-performance-report.js`
- `public/script.js`
- `public/scripts/character-list-state.js`
- `public/perf-harness.html`
- `scripts/interaction-performance-runner.mjs`

The goal of this slice is narrow:

- avoid reparsing every character PNG and rescanning every chat directory on each `POST /api/characters/all`
- reuse a fresh per-character cached `full_json` on `POST /api/characters/get` when the indexed row still matches the source PNG
- keep canonical character and chat files on disk
- reduce the visible lag after character deletion by removing the success-path full character-list refetch
- keep the indexed fast path self-healing when derived rows or SQLite state become inconsistent
- add a reproducible local A/B runner that can prove whether the current SQLite slice is helping enough to justify its maintenance cost

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

- feature-detects `node:sqlite`
- opens one cached `DatabaseSync` handle per user root
- closes cached handles during server shutdown
- resets cached handles when structural index operations fail
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

`src/endpoints/characters.js` now routes `POST /api/characters/all` through the index when runtime support exists.

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

### `/api/characters/get` index-first path

`src/endpoints/characters.js` now routes `POST /api/characters/get` through a narrower safe reuse path:

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

Artifact contract:

- `artifacts/interaction-perf/<timestamp>/report.json`
- `artifacts/interaction-perf/<timestamp>/report.md`
- `artifacts/interaction-perf/<timestamp>/samples.json`
- `artifacts/interaction-perf/<timestamp>/config.json`
- scenario screenshots

Important reliability controls:

- baseline data is cloned per pair so index files and dirty-state mutations do not leak between variants
- cloned roots preserve timestamps so file-backed aggregates stay comparable
- the benchmark config sets `skipContentCheck: true` so default content injection does not pollute the synthetic dataset
- dirty-chat benchmark writes a fixed payload and forces a fixed chat-file `mtime` through a perf-only hook in `src/endpoints/chats.js`, avoiding false mismatches caused by variant run time
- semantic comparison ignores fields that are not stable enough for same-machine A/B parity, such as humanized chat label text, while still checking the fields that matter for correctness

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

### Delete-flow UI update

`public/script.js` no longer calls `getCharacters()` after a successful character delete.

Instead it now:

1. removes deleted avatars from the in-memory `characters` array through `public/scripts/character-list-state.js`
2. refreshes groups
3. reprints the list with `printCharacters(true)`

This preserves the existing chat reset semantics while avoiding a second full character-list request in the delete success path.

The delete flow now also uses a dedicated preflight helper before the delete request:

- `closeCurrentChatForDelete()` reuses the existing save/generation guards and low-level chat cleanup
- the helper suppresses the next welcome-screen `CHAT_CHANGED` hydration attempt, then still emits a lightweight pre-delete `CHAT_CHANGED`
- this preserves existing chat-scoped cleanup listeners such as TTS/gallery teardown without blocking the delete request on welcome-screen recent-chat hydration
- the helper still reselects the characters view so the visible landing state matches the old flow

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

## Performance And Caching

- Steady-state character-list reads no longer require one `processCharacter()` call per avatar when the runtime index is available and rows are clean.
- Chat-directory aggregate recomputation is deferred until the next character-list read after a relevant chat mutation.
- Dirty chat-stat refresh now uses the cached JSON payloads instead of reparsing the source PNG again.
- The feature keeps two distinct caches with different responsibilities:
  - `DiskCache` for PNG card extraction
  - SQLite sidecar for precomputed `/api/characters/all` payloads plus safe `/api/characters/get` full-payload reuse
- Delete success avoids one extra `/api/characters/all` network roundtrip and one extra full list rebuild on the client.
- Corrupt derived rows are pruned opportunistically so steady-state reads can self-heal instead of degrading the whole list path.
- The benchmark results should be interpreted per scenario, not as one global “SQLite is faster” claim.
  - first build can be materially slower because it pays index creation cost
  - warm list reads are the main gain surface
  - warm `/get` gains are smaller because the route still validates file-backed freshness
- Delete-flow measurements now need two readings, not one:
  - pre-delete safety-path cost, which this slice reduced by suppressing welcome-screen hydration while still preserving the lightweight `CHAT_CHANGED` cleanup callback path
  - post-delete UI completion cost, which can still dominate large-profile reruns because `removeCharacterFromUI()` keeps its later refresh and `CHAT_CHANGED` work
