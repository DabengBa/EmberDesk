# Canonical SQLite Store Manager

## Module Responsibility

`src/canonical-sqlite.js` owns the first durable runtime foundation for canonical per-user SQLite storage under [ADR-0011](../adr/0011-canonical-per-user-sqlite-storage.md). It does not make SQLite authoritative by itself. Instead, it establishes the per-user DB path, lifecycle, fail-closed behavior, and transaction contract that later migration, import, read, and write slices will build on.

Primary files:

- `src/canonical-sqlite.js`
- `src/storage-feature-flags.js`
- `src/constants.js`
- `src/user-directories.js`
- `src/users.js`
- `default/config.yaml`
- `tests/canonical-sqlite.test.js`
- `tests/user-directories.test.js`

This slice owns:

- canonical DB path resolution under `DATA_ROOT/<handle>/storage/`
- `emberdesk.sqlite` filename default
- open/close/dispose lifecycle for a per-user `DatabaseSync` handle
- canonical PRAGMA baseline
- explicit synchronous transaction helper
- feature-flag status reporting for `enabled` and `strict`
- fail-closed behavior for unsupported runtime, disabled flag, migration-blocked gate, and open failure

This slice does not own:

- schema migrations
- schema creation beyond opening the DB handle
- shadow import or audit
- character read/write cutover
- chat stats authority
- repair tooling
- any route-level authority switch

## Architecture And Constraints

Canonical SQLite remains separate from derived caches.

- canonical DB location: `DATA_ROOT/<handle>/storage/emberdesk.sqlite`
- derived sidecar location: `DATA_ROOT/<handle>/_cache/*.sqlite`

`src/canonical-sqlite.js` intentionally does not reuse `src/derived-cache-sqlite.js`.

The separation is structural, not just naming:

- derived helper semantics assume rebuildable state and can delete corrupt DB files
- canonical helper semantics must fail closed without deleting DB or user files
- derived helper uses `synchronous = NORMAL`
- canonical helper uses `synchronous = FULL`

Current feature flags are declared in `default/config.yaml` under:

- `features.storage.canonicalSqlite.enabled`
- `features.storage.canonicalSqlite.shadowImport`
- `features.storage.canonicalSqlite.reads`
- `features.storage.canonicalSqlite.writes`
- `features.storage.canonicalSqlite.chatStats`
- `features.storage.canonicalSqlite.strict`

Only the manager slice currently uses the master gate and strict gate directly. The remaining flags are forward-declared rollout controls for later phases and still default to `false`.

## Core Implementation

### Path ownership

`src/constants.js` adds `USER_DIRECTORY_TEMPLATE.storage = 'storage'`.

`src/user-directories.js` now returns `directories.storage` alongside the existing per-user directories. This keeps canonical storage rooted in the same `DATA_ROOT/<handle>/` ownership model as the rest of EmberDesk user data without mixing it into account metadata under `DATA_ROOT/_storage`.

### Manager lifecycle

`src/canonical-sqlite.js` provides:

- `resolveCanonicalStorageRoot(directories)`
- `resolveCanonicalDatabasePath(directories, filename?)`
- `applyCanonicalPragmas(db)`
- `withCanonicalTransaction(db, fn)`
- `createCanonicalSqliteManager(...)`

The manager caches one open handle per canonical DB path. It reports status through:

- `getCanonicalStorageStatus(...)`
- `openCanonicalDatabase(...)`
- `closeCanonicalDatabase(...)`
- `disposeCanonicalDatabases()`

### Fail-closed behavior

When canonical SQLite is disabled or not yet ready, the manager does not silently assume authority.

Current status reasons include:

- `disabled`
- `unsupported`
- `migration_blocked`
- `open_failed` via `lastAction` / `lastError`
- `close_failed` via `lastAction` / `lastError`

Strict mode only changes failure visibility. It does not make SQLite authoritative by itself.

### Transaction boundary

`withCanonicalTransaction(db, fn)` enforces a synchronous callback contract.

That is intentional for the current slice:

- `BEGIN IMMEDIATE`
- execute callback
- reject promise-like callbacks
- `COMMIT` on success
- `ROLLBACK` on error

The async-callback rejection exists to prevent later write slices from accidentally committing before awaited work completes.

## Related Semantic IDs And Code Binding Points

No new semantic product ID is introduced by this slice.

Existing user-visible surfaces that later storage phases will support remain:

- `feature.character_library_panel`
- `page.chat_workspace`

Code binding points:

- `getUserDirectories(handle)` remains the per-user root resolver
- `src/canonical-sqlite.js` owns canonical DB lifecycle
- `src/storage-feature-flags.js` owns the storage rollout flag snapshot for this slice

## Validation

Focused proof:

```bash
pnpm --dir tests run test:unit -- canonical-sqlite.test.js user-directories.test.js derived-cache-sqlite.test.js --runInBand
```

What the tests currently prove:

- canonical DB paths stay under `DATA_ROOT/<handle>/storage`
- filename escapes are rejected
- `directories.storage === directories.root` is rejected
- `enabled=false` does not take authority
- unsupported `node:sqlite` fails closed and throws in strict mode
- migration-blocked mode fails closed and throws in strict mode
- canonical PRAGMAs differ from derived-cache PRAGMAs
- transactions roll back on error
- async transaction callbacks are rejected
- open failure does not delete DB or user files
- close failure does not falsely report the handle as closed

## Boundaries

- Current character list/read/write acceleration remains documented in [interaction-performance-indexing](interaction-performance-indexing.md).
- Derived sidecar lifecycle remains documented in [derived-cache-sqlite](derived-cache-sqlite.md).
- Phase order, feature flags, and rollback rules remain owned by [canonical-sqlite-storage-roadmap](canonical-sqlite-storage-roadmap.md).

## Related Control Plane

Per-user DB open/close remains owned by this manager. Slice rollout, audit/repair routing,
operator status, and backup/restore readiness are owned by:

- `src/canonical-storage-slice-registry.js`
- `src/canonical-sqlite-rollout-contract.js`
- `src/canonical-sqlite-operator.js`

The control plane does not open databases itself; it consumes manager handles and migration
status for registered slices.

