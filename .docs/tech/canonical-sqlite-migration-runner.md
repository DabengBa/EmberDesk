# Canonical SQLite Migration Runner

## Module Responsibility

`src/canonical-sqlite-migrations.js` owns the schema-history and migration contract for EmberDesk's future canonical per-user SQLite store under [ADR-0011](../adr/0011-canonical-per-user-sqlite-storage.md). It sits above `src/canonical-sqlite.js`: the manager opens the DB and enforces fail-closed lifecycle rules, while the migration runner decides whether that DB is at a supported schema version and, if not blocked, applies ordered schema changes.

Primary files:

- `src/canonical-sqlite-migrations.js`
- `src/canonical-sqlite.js`
- `tests/canonical-sqlite-migrations.test.js`
- `tests/canonical-sqlite.test.js`

This slice owns:

- the ordered `CANONICAL_SQLITE_MIGRATIONS` catalog
- bootstrap of the `schema_migrations` journal table
- forward-only synchronous migration execution inside canonical transactions
- phase-one schema creation for `characters`, `character_chat_stats`, and `projection_repairs`
- migration status reporting for healthy and blocked DBs
- fail-closed blocking when the DB schema is newer than the supported target or a migration fails

This slice does not own:

- importing file-backed character or chat data into canonical rows
- DB-first route reads or writes
- repair execution
- rollback orchestration beyond reporting blocked status

## Architecture And Constraints

The migration runner follows the same durability boundary as the canonical manager:

- canonical DB lives under `DATA_ROOT/<handle>/storage/emberdesk.sqlite`
- migration failure must not delete that DB or any user files
- unsupported or blocked state must disable canonical authority rather than guess

Current design constraints:

- no ORM in this slice
- no implicit schema inference from route code
- no automatic downgrade or destructive reset path
- migration order must stay explicit and stable

`schema_migrations` is runner-owned infrastructure, not application schema owned by later features. Migration SQL entries should describe the schema changes for that version; the runner prologue is responsible for ensuring the journal table exists before version checks or inserts happen.

## Core Implementation

### Catalog and target version

`CANONICAL_SQLITE_MIGRATIONS` is an explicit ordered array. The current delivered catalog contains one migration:

- `version: 1`
- `name: phase_one_character_metadata_and_chat_stats`

The target version is the last version in that ordered catalog.

### Journal and schema bootstrap

The runner first ensures `schema_migrations(version, name, applied_at_ms)` exists. Migration v1 then creates:

- `characters`
- `character_chat_stats`
- `projection_repairs`
- supporting indexes for avatar filename, display name, world name, last-chat sort, and unresolved repairs

This keeps the journal bootstrap separate from versioned schema content while still making the first usable DB self-contained after migration v1 completes.

### Execution and failure contract

`runCanonicalMigrations(db, options)`:

- validates the migration catalog
- checks the current applied version from `schema_migrations`
- blocks when the DB version is newer than the supported target
- runs pending migrations in ascending version order inside `withCanonicalTransaction(...)`
- records successful applications in `schema_migrations`
- returns structured status for success or blocked state

`getCanonicalMigrationStatus(db, options)`:

- validates the catalog
- returns the remembered blocker for the open DB handle when one exists
- otherwise reports `currentVersion`, `targetVersion`, and the persisted `appliedVersions` already recorded in `schema_migrations`
- fails closed when the recorded journal is not a contiguous prefix of the current catalog or when an applied migration name no longer matches the current catalog entry for that version

### Blocking semantics

Blocked states currently cover:

- migration SQL failure
- current DB schema version newer than the shipped catalog target
- non-contiguous or unknown applied journal entries
- applied migration names that diverge from the current catalog

`CanonicalMigrationBlockedError` is thrown only in strict mode. Non-strict mode returns a blocked status object so callers can keep file-backed behavior while surfacing a clear operator reason.

## Related Semantic IDs And Code Binding Points

No new semantic product ID is introduced by this slice.

Existing user-visible surfaces that later canonical phases will support remain:

- `feature.character_library_panel`
- `page.chat_workspace`

Code binding points:

- `src/canonical-sqlite.js` provides `withCanonicalTransaction(...)` and the manager's `migration_blocked` status contract
- `src/canonical-sqlite-migrations.js` owns migration status and schema-version checks
- later shadow import, audit, and read/write cutover slices must treat this module as the only schema-history authority

## Performance Or Caching Notes

This slice does not add a new steady-state cache. Its effect is startup-time DB readiness:

- first-run cost is the one-time migration pass
- repeat runs are idempotent and return immediately when no versions are pending
- blocked status is remembered per open DB handle so later checks can fail closed without rerunning broken SQL

## Validation

Focused proof:

```bash
pnpm --dir tests run test:unit -- canonical-sqlite-migrations.test.js canonical-sqlite.test.js derived-cache-sqlite.test.js --runInBand
```

What the tests currently prove:

- the migration catalog is ordered and contains the phase-one schema contract
- first run creates the canonical schema and records applied version metadata
- rerunning migrations is idempotent and preserves existing rows
- broken migration SQL returns a stable blocker without deleting the DB file
- strict mode throws `CanonicalMigrationBlockedError`
- the canonical manager can surface `migration_blocked` from the migration status contract
- a DB with a newer schema version than the shipped target fails closed
- a DB with non-contiguous applied migration history fails closed
- a DB whose applied migration names no longer match the current catalog fails closed
- successful rerun clears a previously remembered blocker

## Boundaries

- Phase order, feature flags, and rollback expectations remain owned by [canonical-sqlite-storage-roadmap](canonical-sqlite-storage-roadmap.md).
- Canonical DB lifecycle, PRAGMAs, and transaction primitives remain owned by [canonical-sqlite-store-manager](canonical-sqlite-store-manager.md).
- This slice still does not change runtime authority; file-backed character cards and chats remain the steady-state source until later phases land.
