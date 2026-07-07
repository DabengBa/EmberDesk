# Canonical SQLite Shadow Import And Audit

## Module Responsibility

`src/canonical-sqlite-shadow-import.js` owns the Phase 1 bridge between EmberDesk's file-backed character data and the future canonical per-user SQLite store accepted by [ADR-0011](../adr/0011-canonical-per-user-sqlite-storage.md). It imports character metadata plus chat stats into the canonical DB without changing runtime authority, and it provides a machine-readable audit that compares canonical rows against the current file-backed projection.

Primary files:

- `src/canonical-sqlite-shadow-import.js`
- `src/endpoints/character-file-snapshot.js`
- `src/endpoints/characters.js`
- `tests/canonical-sqlite-shadow-import.test.js`

This slice owns:

- idempotent shadow import of `characters` and `character_chat_stats`
- reuse of the current file-backed character snapshot semantics for payload parity
- per-avatar import result classification (`imported`, `updated`, `unchanged`, `error`)
- machine-readable audit entries for DB/file drift
- fail-closed audit gating when canonical migrations are missing or blocked
- persisted audit-summary state that later DB-first reads can consume as a fail-closed gate

This slice does not own:

- DB-first route reads
- DB-first character writes or compatibility projection
- automatic drift repair
- canonical storage of chat message bodies or full World Info entries

## Architecture And Constraints

Phase 1 keeps file-backed character cards, chat directories, and world files as runtime authority. Canonical SQLite is only a shadowed copy plus an audit surface.

Current constraints:

- canonical DB access must go through `src/canonical-sqlite.js`
- schema readiness must go through `src/canonical-sqlite-migrations.js`
- import must not rewrite PNG cards, chat JSONL, or world JSON files
- audit drift must block future cutover decisions, not silently repair state
- payload semantics must be reused from the existing file-backed snapshot path instead of reimplemented ad hoc

The canonical `characters.id` contract is now internal and stable across repeat imports for the same avatar row. Avatar filenames remain compatibility identifiers, but the shadow import no longer derives the primary key from `avatar_filename`, which keeps later rename- and projection-sensitive phases from depending forever on filename identity.

## Core Implementation

### Snapshot parity

`src/endpoints/character-file-snapshot.js` is the shared file-backed snapshot seam. It now owns:

- full payload extraction from character cards
- shallow payload derivation
- chat stat calculation
- world metadata extraction for the legacy derived index
- chat-directory path derivation

`src/endpoints/characters.js` reuses the same helper so the shadow importer and the current file-backed read/index path stay on the same payload and chat-stat semantics.

### Shadow import

`runCanonicalShadowImport(...)`:

- exits inertly when `features.storage.canonicalSqlite.enabled` or `shadowImport` is off
- fails closed with `reason: canonical_storage_unavailable` when `node:sqlite` support is unavailable
- runs canonical migrations before touching row imports
- reads each avatar from the shared snapshot helper
- reuses an existing canonical `characters.id` when the avatar row already exists
- generates a new internal UUID only on first import of that avatar row
- upserts `characters` by `avatar_filename`
- upserts `character_chat_stats` by `character_id`
- records per-avatar success or error without clearing previously imported rows

### Audit

`auditCanonicalShadowImport(...)`:

- checks migration readiness before per-avatar comparison
- returns `reason: migration_blocked` when the open DB is in a blocked migration state
- returns `reason: migration_not_applied` when the DB handle exists but has not reached the target canonical schema version yet
- compares file-backed snapshots to canonical rows for:
  - missing DB character rows
  - payload drift
  - world-binding drift
  - chat-stat drift
- returns machine-readable entries with `handle`, `avatar_filename`, `character_id`, `status`, `drift_types`, `details`, and `audited_at_ms`
- marks the audit result as `blocking` whenever drift or audit errors exist
- persists the latest clean-vs-blocked audit summary into canonical SQLite only after migrations are ready, so later read cutover can distinguish `audit_not_run` from a passed audit without re-reading the filesystem on every request

## Related Semantic IDs And Code Binding Points

No new semantic product ID is introduced by this slice.

Existing user-facing surfaces supported by this backend-prep slice remain:

- `feature.character_library_panel`
- `page.chat_workspace`

Code binding points:

- `src/canonical-sqlite.js` owns DB lifecycle and transaction boundaries
- `src/canonical-sqlite-migrations.js` owns schema readiness and blocked-status reporting
- `src/endpoints/character-file-snapshot.js` owns file-backed payload/chat-stat snapshot parity
- later DB-first read/write slices must treat this module as Phase 1 import/audit ownership, not as a general query layer

## Performance Or Caching Notes

This slice adds background import/audit work but does not change steady-state route authority.

Relevant notes:

- repeated shadow imports are idempotent and skip row rewrites when payload and chat-stat content are unchanged
- `stats_updated_at_ms` is intentionally treated as a write-time clock, not a content field, so repeated imports with unchanged files remain `unchanged`
- chat stats now use the shared chat-directory helper so import parity matches the existing file-backed behavior even for odd avatar basenames containing `.png`
- canonical shadow state remains separate from `_cache/character-index.sqlite`; no derived-cache reset/delete semantics are reused
- current runtime character/chat mutations now invalidate the persisted audit summary so a previously clean audit cannot keep future DB-first reads serving stale canonical rows after normal file-backed writes

## Validation

Focused proof:

```bash
bun run --cwd tests test:unit -- canonical-sqlite-shadow-import.test.js canonical-sqlite-migrations.test.js canonical-sqlite.test.js --runInBand
bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js --runInBand
```

What the tests currently prove:

- first import writes canonical character metadata and chat stats without mutating source files
- repeat import is idempotent
- existing canonical `characters.id` remains stable across later row updates
- per-avatar failures do not clear earlier imported rows
- audit reports missing-row, payload, world-binding, and chat-stat drift in machine-readable form
- audit fails closed with explicit schema-readiness reasons when migrations are blocked or not yet applied
- persisted audit state remains `audit_not_run` until migrations are ready and a real audit has completed, which keeps later read cutover fail-closed by default
- shared snapshot reuse preserved the existing file-backed read/index behavior after the refactor

## Boundaries

- Phase ordering, rollout flags, and rollback expectations remain owned by [canonical-sqlite-storage-roadmap](canonical-sqlite-storage-roadmap.md).
- Canonical DB lifecycle remains owned by [canonical-sqlite-store-manager](canonical-sqlite-store-manager.md).
- Schema history remains owned by [canonical-sqlite-migration-runner](canonical-sqlite-migration-runner.md).
- Runtime authority is still file-backed after this slice; DB-first reads and writes are later phases.
