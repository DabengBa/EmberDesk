# Derived Cache SQLite Helper

## Module Responsibility

`src/derived-cache-sqlite.js` owns the shared lifecycle for SQLite files that are derived from canonical filesystem data. Project-level cache boundaries are summarized in [project-overview](../project-overview.md), and the retired character-index history is described in [interaction-performance-indexing](interaction-performance-indexing.md).

The helper is infrastructure only. It owns:

- `node:sqlite` / `DatabaseSync` feature detection
- parsed sidecar mode handling such as `auto`, `force_on`, and `force_off`
- `<user root>/_cache/*.sqlite` path preparation
- cached `DatabaseSync` handle lifecycle by user root and logical sidecar key
- common SQLite PRAGMA setup
- `meta.schema_version` tracking
- idempotent schema hooks supplied by the owning sidecar module
- reset count tracking and current-process circuit breaking
- structured operator logs and read-only status queries

The helper does not own business rules. Entity modules continue to own their schema, payloads, freshness keys, invalidation rules, and filesystem fallback behavior.

As of [ADR-0009](../adr/0009-derived-cache-sqlite-drizzle-decision.md), EmberDesk explicitly did not adopt Drizzle for the character-index derived-cache slice. That decision remains useful historical context for helper-level maintenance, but the character-index sidecar is no longer part of normal runtime operation.

## Derived Cache Contract

SQLite sidecars under `_cache` are rebuildable acceleration artifacts. They are never the canonical storage location for approved canonical SQLite slices.

For the retired character sidecar:

- legacy compatibility character cards remain `data/<user>/characters/*.png`
- legacy compatibility chats remain `data/<user>/chats/**`
- the derived SQLite file remains `<user root>/_cache/character-index.sqlite`
- deleting or rebuilding the SQLite file must not lose user data
- `/api/characters/all`, `/list`, and `/get` no longer use this sidecar as a normal accelerator or fallback authority path

Historically, legacy compatibility character-card and chat files were the authoritative input for rebuilding this sidecar. Current normal routes read canonical SQLite when enabled and audit-clean, or direct compatibility files when fallback is required.

Future sidecars must follow the same rule: the source files are authoritative, and the SQLite file can be deleted and rebuilt from those files.

## Current Integration

There is currently no normal-runtime character route owner for `_cache/character-index.sqlite`. `src/endpoints/character-index.js` remains as a retired helper module and may use this helper when historical tests or interaction-performance report compatibility exercise it.

That retired helper uses the lifecycle helper for:

- opening the per-user `character-index.sqlite`
- applying the shared PRAGMA baseline
- managing the cached handle
- checking and writing `schema_version`
- closing handles on shutdown
- reset count and circuit-breaker state
- status reporting

`character-index.js` still owns the retired helper's:

- the `characters` table schema
- `full_json` and `shallow_json`
- character source `mtimeMs` / `size` freshness
- linked world-info stat freshness
- `chat_stats_dirty`
- corrupt JSON row cleanup
- historical character-list and single-character payload APIs

## Operator Signals

The helper emits structured `console.info` records with:

- `mode`
- `nodeSqliteAvailable`
- `dbPath`
- `schemaVersion`
- `action`
- `resetCount` when relevant
- `disabledReason` when relevant

`action` values include:

- `available` for explicit helper status logging
- `opened` when an existing compatible sidecar opens
- `migrated` when schema version setup/reset runs
- `disabled` when mode or circuit breaker disables a sidecar
- `unsupported` when `node:sqlite` is unavailable

`disabledReason` values currently include:

- `force_off`
- `unsupported`
- `reset_threshold_exceeded`

`src/server-main.js` no longer logs character-index startup status or disposes character-index databases during normal shutdown.

Tests and diagnostic tooling can query status through the retired sidecar wrapper exported by `src/endpoints/character-index.js`, which delegates to the helper and reports:

- `supported`
- `mode`
- `dbPath`
- `open`
- `schemaVersion`
- `resetCount`
- `disabledReason`

There is no HTTP health/status endpoint for this slice, and character routes no longer emit character-index status headers. If an operator UI or `/health` response needs derived-cache status later, it needs a separately designed API boundary rather than reviving the retired character-index route dependency.

## SQLite Baseline

The helper applies the same PRAGMA baseline to each sidecar:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
```

`synchronous = NORMAL` is acceptable here because these SQLite files are derived and rebuildable. Canonical filesystem writes remain the durability boundary.

## Recovery And Circuit Breaker

Structural SQLite failures reset the cached handle. Corrupt database files encountered during open are removed along with their `-wal` and `-shm` files, then rebuilt from the owner-provided schema hooks.

Each sidecar state tracks reset count. After the reset threshold is reached, the helper disables that sidecar for the current process. Historical owner modules fell back to compatibility-file reads; current character routes already bypass the retired sidecar, so helper disablement should not affect normal character-library availability.

The disabled state is process-local and does not write to canonical user data.

## Single-Process Assumption

The helper assumes one Node.js process owns a given `<user root>/_cache/*.sqlite` writer at a time.

SQLite WAL supports concurrent readers, but multiple EmberDesk writer processes sharing the same user root are outside this slice. If EmberDesk later supports multi-worker or multi-instance writes to one user root, this helper needs a file-locking design or an external database boundary.

## Validation

Primary proof:

```bash
pnpm --dir tests run test:unit -- derived-cache-sqlite.test.js interaction-performance-index.test.js --runInBand
```

This command proves helper lifecycle behavior independently and keeps historical character-index coverage explicit while route-level tests prove normal runtime ignores the retired sidecar.
