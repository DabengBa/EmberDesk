# Interaction Performance Indexing

## Why

This feature targets the most visible interaction lag in EmberDesk's daily use path:

- opening the character panel repeatedly
- refreshing character-derived chat stats
- waiting for the UI after a successful character delete

Before this slice, `POST /api/characters/all` reparsed every character PNG and rescanned every character chat directory on each request, and the delete success path reloaded the entire character list again through `getCharacters()`.

## Delivered

### Server-side derived index

- Added `src/endpoints/character-index.js`.
- Introduced a per-user derived SQLite sidecar at:
  - `<user root>/_cache/character-index.sqlite`
- Stored both current list payload variants:
  - `full_json`
  - `shallow_json`
- Added rebuild rules based on:
  - missing rows
  - source file `mtime`
  - source file size
  - `chat_stats_dirty`

### `/api/characters/all` fast path

- `src/endpoints/characters.js` now serves `/api/characters/all` from the index when runtime SQLite support exists.
- The route preserves both existing payload contracts:
  - full list objects when `performance.lazyLoadCharacters=false`
  - shallow rows when `performance.lazyLoadCharacters=true`
- If indexed read/rebuild fails, the route falls back to the previous filesystem-backed scan.

### Mutation consistency

- Character mutations now refresh or delete indexed rows after successful canonical file writes:
  - create
  - rename
  - edit
  - edit-avatar
  - edit-attribute
  - merge-attributes
  - delete
  - import
  - duplicate
- Bulk `merge-attributes` refreshes all successfully updated avatars after the batch.
- Character chat mutations now mark chat-derived aggregates dirty after:
  - save
  - rename
  - delete
  - import

### Delete-flow UI update

- Added `public/scripts/character-list-state.js`.
- `public/script.js` no longer calls `getCharacters()` after successful character deletion.
- The success path now:
  1. removes deleted avatars from the in-memory `characters` array
  2. refreshes groups
  3. reprints the list

### Documentation

- Added `.docs/tech/interaction-performance-indexing.md`
- Added `docs/interaction-performance.md`
- Reconciled the spec narrative with the final runtime contract:
  - use `node:sqlite` when available
  - fall back safely when unavailable

## Runtime Contract

The indexed fast path is intentionally runtime-gated.

- If the active Node runtime exposes `node:sqlite`, EmberDesk enables the derived character index.
- If `node:sqlite` is unavailable, EmberDesk preserves the previous filesystem-backed behavior for `/api/characters/all`.

This keeps the feature upgrade-safe for deployments that are still on a Node build without `node:sqlite`.

## Validation

### Automated proof

- `cd tests; npm run test:unit -- interaction-performance-index.test.js`
  - Result: `PASS ./interaction-performance-index.test.js` on `2026-05-09`

Covered directly:

- missing-index rebuild
- full/shallow payload reads from the same indexed rows
- dirty-row rebuild after chat-stat invalidation
- stat-change rebuild
- row deletion
- local character-array diff helper used by delete flow

### Static validation

- `npx eslint src/endpoints/characters.js src/endpoints/chats.js public/script.js public/scripts/character-list-state.js`
  - Result: no reported lint errors on `2026-05-09`

### Runtime validation

- Local validation server started successfully on `http://127.0.0.1:8130/`
- Direct runtime check returned `HTTP 200` for `/`

### Accepted validation boundary

- A real-browser delete-flow/network proof was attempted through the browser validation path but did not return usable evidence in this run.
- This gap is explicitly tracked in the final audit instead of being reported as complete.

## Result

This slice removes repeated PNG parsing from the steady-state character-list hot path when runtime SQLite support exists, keeps chat-derived list aggregates cheap to maintain, and removes the delete success path's second full character-list fetch.

## Residual Boundaries

- No world-info indexing in this slice
- No chat search or recent-chat indexing in this slice
- No group-chat parity for the same indexed fast path
- Largest steady-state benefit depends on the deployment runtime exposing `node:sqlite`

## Doc ID Contract

- No semantic Doc IDs were introduced or migrated in this feature.
