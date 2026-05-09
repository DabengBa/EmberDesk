# Interaction Performance Indexing

## Module Responsibility

This document covers the first delivered slice of EmberDesk's interaction-performance work for the character list hot path.

Primary files:

- `src/endpoints/character-index.js`
- `src/endpoints/characters.js`
- `src/endpoints/chats.js`
- `public/script.js`
- `public/scripts/character-list-state.js`

The goal of this slice is narrow:

- avoid reparsing every character PNG and rescanning every chat directory on each `POST /api/characters/all`
- keep canonical character and chat files on disk
- reduce the visible lag after character deletion by removing the success-path full character-list refetch

## Architecture And Constraints

- Canonical user data remains file-backed:
  - character cards in `data/<user>/characters/*.png`
  - chats in `data/<user>/chats/**`
- The SQLite file is derived state only:
  - `<user root>/_cache/character-index.sqlite`
- The first slice preserves both existing `/api/characters/all` payload modes:
  - full objects when `performance.lazyLoadCharacters=false`
  - shallow rows when `performance.lazyLoadCharacters=true`
- `POST /api/characters/get` stays file-backed and authoritative.
- The new index does not replace the existing `DiskCache`.
  - `DiskCache` still accelerates PNG-to-JSON extraction through `readCharacterData()`
  - the SQLite sidecar accelerates only the character-list path
- The indexed fast path is optional at runtime.
  - when the active Node runtime exposes `node:sqlite`, EmberDesk enables the derived character index
  - when `node:sqlite` is unavailable, EmberDesk falls back to the previous filesystem-backed `/api/characters/all` path
- Chat save stays lightweight.
  - chat mutations mark character chat aggregates dirty
  - they do not rebuild the full indexed row on every save

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
  - `chat_stats_dirty`

The module:

- feature-detects `node:sqlite`
- opens one cached `DatabaseSync` handle per user root
- recreates derived rows when:
  - the row is missing
  - the source PNG `mtime` changes
  - the source PNG size changes
  - `chat_stats_dirty=1`
- removes rows whose source avatar files no longer exist

### `/api/characters/all` fast path

`src/endpoints/characters.js` now routes `POST /api/characters/all` through the index when runtime support exists.

Build source for each row:

1. `processCharacter(avatar, directories, { shallow: false })`
2. `toShallow(fullPayload)`
3. source file stat (`mtimeMs`, `size`)

Failure behavior:

- if indexed read or rebuild fails, the route logs the failure and falls back to the previous filesystem scan
- this keeps the page usable even when the derived DB is unavailable or corrupted

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

Character-chat mutations in `src/endpoints/chats.js` now mark chat-derived aggregates dirty after successful:

- save
- rename
- delete
- import

This keeps `chat_size` and `date_last_chat` accurate on the next list read without making autosave synchronous-and-heavy.

### Delete-flow UI update

`public/script.js` no longer calls `getCharacters()` after a successful character delete.

Instead it now:

1. removes deleted avatars from the in-memory `characters` array through `public/scripts/character-list-state.js`
2. refreshes groups
3. reprints the list with `printCharacters(true)`

This preserves the existing chat reset semantics while avoiding a second full character-list request in the delete success path.

## Related Semantic IDs And Code Binding Points

This repo does not currently maintain a semantic product-doc DB for this feature surface.

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
- The feature keeps two distinct caches with different responsibilities:
  - `DiskCache` for PNG card extraction
  - SQLite sidecar for precomputed list payloads
- Delete success avoids one extra `/api/characters/all` network roundtrip and one extra full list rebuild on the client.
