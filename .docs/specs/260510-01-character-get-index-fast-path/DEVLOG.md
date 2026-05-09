# Character Get Index Fast Path

## Why

Before this slice, EmberDesk already stored per-character `full_json` rows in the derived SQLite index, but `POST /api/characters/get` still reparsed the source PNG on every request.

That left a gap between what was cached and what was actually reused on the steady-state full-character read path used by:

- shallow-to-full character hydration
- post-edit character refresh

## Delivered

### Safe `/api/characters/get` index reuse

- `src/endpoints/character-index.js` now exposes a single-row `full_json` read helper for `POST /api/characters/get`.
- The helper only returns a cached payload when all of the following are true:
  - the avatar row exists
  - `source_mtime_ms` matches the current PNG file `mtime`
  - `source_size` matches the current PNG file size
  - linked legacy world-info source metadata still matches when the card derives `data.character_book` from an external world file
  - the cached `full_json` parses successfully
- The helper also recomputes chat aggregates before reusing the cached row, so out-of-band chat cleanup does not leave `chat_size` / `date_last_chat` stale indefinitely.
- If the cached payload is corrupt, the helper deletes the bad row and returns `null` so the caller can fall back safely.
- If a previously linked world file has already been deleted and the last rebuilt row reflects that missing state, the cached "no character book available" result remains reusable until the world file reappears.

### File-authoritative fallback preserved

- `src/endpoints/characters.js` now routes `POST /api/characters/get` through:
  1. file existence check
  2. single-row indexed lookup
  3. file-backed `processCharacter(...)` fallback when the row is missing, stale, corrupt, or runtime SQLite support is unavailable
- After a successful file-backed fallback, the route re-stats the source PNG and refreshes the indexed row opportunistically with current file metadata.
- Missing avatar files still return `404`.
- The SQLite sidecar remains derived state, not a new source of truth.
- Legacy world-source metadata is sanitized before it is written into SQLite, rather than relying only on read-time sanitization.

### Regression coverage

- Extended `tests/interaction-performance-index.test.js` with `/api/characters/get` coverage for:
  - fresh indexed reuse
  - dirty chat-stat refresh before indexed response
  - out-of-band chat cleanup before indexed response
  - stale-row file fallback and row repair
  - corrupt-row file fallback and row repair
  - legacy world-info content changes
  - world-file delete/reappear cycle
  - sanitized world-name persistence in the index
  - non-SyntaxError index failure recovery
  - mid-request PNG change with correct post-fallback metadata writeback

### Documentation updates

- Updated `.docs/tech/interaction-performance-indexing.md` to describe `/api/characters/get` as index-first with file-backed fallback.
- Updated `.docs/project-overview.md` so the current derived-cache scope reflects safe single-character full reads in addition to the character-library list API.
- Preserved the related local semantic/doc clarifications already in progress:
  - `.docs/db/features/character-library-panel.md`
  - `.docs/db/terms/character-card.md`

## Validation

### Automated proof

- `cd tests; npm run test:unit -- interaction-performance-index.test.js --runInBand`
  - Result: `PASS ./interaction-performance-index.test.js` on `2026-05-10`

### Static validation

- `npx eslint src/endpoints/character-index.js src/endpoints/characters.js tests/interaction-performance-index.test.js`
  - Result: no reported errors on `2026-05-10`

### Documentation validation

- `npm run docs:check`
  - Result: passed on `2026-05-10`
- `npm run docs:build`
  - Result: passed on `2026-05-10`

## Result

This slice closes the earlier utilization gap: cached `full_json` is now reused on the steady-state single-character full-read path when it is provably fresh, while stale, corrupt, or dependency-invalid rows still degrade back to canonical PNG parsing and then heal opportunistically.

## Boundaries

- No browser-trace performance measurement was added in this slice.
- No database-first character model was introduced.
- No change was made to frontend request contracts.

## Doc ID Contract

- No semantic Doc IDs were introduced, renamed, or removed in this feature.
