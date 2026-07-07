# Canonical SQLite Storage Roadmap

## Module Responsibility

This document owns the executable roadmap for ADR-0011's canonical per-user SQLite storage direction. It defines the first storage slice, phase acceptance gates, task order, feature flags, rollback rules, and validation expectations.

Primary current files:

- `src/canonical-sqlite.js`
- `src/storage-feature-flags.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/chats.js`
- `src/endpoints/character-index.js`
- `src/derived-cache-sqlite.js`
- `src/users.js`
- `src/user-directories.js`

Future implementation candidates:

- `src/endpoints/character-store.js`
- `src/endpoints/character-store-migrations.js`
- `scripts/canonical-sqlite-audit.mjs`
- `scripts/canonical-sqlite-repair.mjs`

Delivered Phase 1 tech docs:

- `canonical-sqlite-store-manager.md`
- `canonical-sqlite-migration-runner.md`
- `canonical-sqlite-shadow-import-audit.md`

## Architecture And Constraints

ADR-0011 accepts canonical per-user SQLite storage for selected slices. The first approved slice is character metadata plus character chat stats.

The canonical DB must be separate from derived caches:

- canonical candidate: `DATA_ROOT/<handle>/storage/emberdesk.sqlite`
- derived sidecar: `DATA_ROOT/<handle>/_cache/character-index.sqlite`
- disk extraction cache: `DiskCache`

Do not place canonical data under `_cache`. Do not reuse `src/derived-cache-sqlite.js` as the canonical DB manager because its reset, corrupt-file removal, circuit-breaker, and fallback semantics are intentionally designed for rebuildable sidecars.

Compatibility remains a hard boundary:

- `/api/characters/*` response shapes stay stable.
- Character avatar filenames remain visible compatibility identifiers.
- PNG card import/export remains available.
- Chat JSONL export remains available.
- Full World Info entries remain file-backed until a separate ADR/spec.
- Extension-visible globals and `@sillytavern/*` imports remain frozen unless a later compatibility retirement decision says otherwise.

SQLite is the local/portable storage target. Express 5 remains the backend runtime owner; this roadmap does not introduce Rust, Axum, PostgreSQL, or a new server host.

## Phase Gates

### Phase 0: Decision And Contracts

Goal: make the direction official before implementation.

Deliverables:

- Accepted `ADR-0011`.
- This roadmap.
- Project overview and history updated.
- Canonical DB location, first-slice scope, non-goals, and compatibility projection policy documented.

Acceptance:

- ADR names the first approved slice: character metadata plus chat stats.
- ADR explicitly forbids promoting `_cache/character-index.sqlite` or `DiskCache` to canonical storage.
- Roadmap includes feature flags and rollback behavior.
- Docs check passes.

### Phase 1: Shadow Import And Audit

Goal: create canonical infrastructure and audit current data without changing runtime behavior.

Deliverables:

- Canonical SQLite manager outside `src/derived-cache-sqlite.js`.
- SQL migration runner with `schema_migrations`.
- Initial schema for `characters` and `character_chat_stats`.
- Import path from existing PNG character cards and chat directories into the DB.
- Read-only audit report that compares DB rows to file projections.
- Focused unit tests for idempotent migration and audit output.

Acceptance:

- Feature flag off preserves current file-backed reads and writes.
- Running import twice is idempotent.
- Missing/corrupt DB never deletes or rewrites user files implicitly.
- Audit reports drift instead of repairing it by default.
- Node 26 `node:sqlite` support is required for canonical DB mode; unsupported runtime fails closed to current behavior in Phase 1.

Current delivered foundation:

- `src/canonical-sqlite.js` now exists as the canonical DB manager.
- `src/canonical-sqlite-migrations.js` now exists as the migration runner for canonical schema history and phase-one schema bootstrap.
- `src/canonical-sqlite-shadow-import.js` now exists as the Phase 1 shadow import/audit owner for character metadata and chat stats.
- `src/endpoints/character-file-snapshot.js` now exists as the shared file-backed snapshot helper reused by both the existing character read/index path and canonical shadow import.
- `src/storage-feature-flags.js` now exposes the current storage flag snapshot for this slice.
- `USER_DIRECTORY_TEMPLATE` and `getUserDirectories(handle)` now include per-user `storage`.
- `default/config.yaml` now declares `features.storage.canonicalSqlite.*` with default `false`.
- Focused proof currently lives in `tests/canonical-sqlite-shadow-import.test.js`, `tests/canonical-sqlite-migrations.test.js`, `tests/canonical-sqlite.test.js`, `tests/user-directories.test.js`, `tests/derived-cache-sqlite.test.js`, `tests/character-read-service.test.js`, and `tests/interaction-performance-index.test.js`.
- Runtime authority is still file-backed because migration/import/read/write cutover has not landed yet, but the schema journal plus phase-one table bootstrap contract is now in place.
- Shadow import now preserves stable canonical character IDs across repeat imports, keeps source files untouched, and fails audit closed with explicit schema-readiness reasons before any read cutover.

### Phase 2: DB-First Reads

Goal: serve character list/get payloads from canonical SQLite behind a feature flag.

Deliverables:

- `character-read-service.js` DB-first read path for:
  - `/api/characters/all`
  - `/api/characters/list`
  - `/api/characters/get`
- Response parity tests against current file-backed payloads.
- Explicit fallback reason reporting for disabled flag, missing DB, failed migration, or audit drift.
- Decision gate for ORM adoption before broadening DB access.

Acceptance:

- Route JSON shapes remain unchanged.
- Character-list identity fields remain compatible with existing frontend and extension selectors.
- DB-first reads can be disabled without deleting DB files.
- Fallback is observable in logs/test hooks, not silent ambiguity.
- Derived `_cache/character-index.sqlite` is not treated as canonical fallback.

Current delivered foundation:

- `src/endpoints/character-store.js` now reconstructs `/api/characters/all`, `/api/characters/list`, and `/api/characters/get` payloads from canonical `characters` plus `character_chat_stats` rows while preserving existing avatar-filename identity and route payload shape.
- `src/endpoints/character-read-service.js` now gates DB-first reads on the persisted canonical audit summary instead of inferring audit success from schema version parity.
- `src/canonical-sqlite-migrations.js` phase-one schema now includes `canonical_audit_state` for the persisted audit gate contract.
- `src/canonical-sqlite-shadow-import.js` now persists clean vs blocked audit summaries after successful audit runs, and `getPersistedCanonicalAuditStatus()` now fails closed as `audit_not_run` until that summary exists.
- `src/endpoints/characters.js` and `src/endpoints/chats.js` now invalidate the persisted canonical audit state after successful file-backed character or chat mutations so DB-first reads cannot continue serving stale canonical rows after normal runtime writes.
- Route-level proof currently lives in `tests/character-read-service.test.js` and `tests/interaction-performance-index.test.js`, including canonical `/all` and `/get` reads, `audit_not_run` fallback, strict-mode failure, and stale-audit invalidation after file-backed character edits.

### Phase 3: DB-First Writes And Projection

Goal: make character mutation routes write canonical SQLite first, then project compatibility files.

Deliverables:

- Transactional write path for create, edit, rename, edit-avatar, edit-attribute, merge, import, duplicate, and delete.
- Compatibility projection for PNG cards and existing avatar filename contracts.
- Projection status table or equivalent repair queue for DB-committed/file-projection-failed cases.
- Tests for projection success, projection failure, and repair queue behavior.

Acceptance:

- DB commit is the authority boundary when the write flag is enabled.
- Projection failure returns explicit error state and records repair intent.
- Flag rollback can return reads to file-backed mode only if audit confirms projected files are complete enough for rollback.
- Destructive actions preserve existing confirmation and cascade behavior.

Current delivered foundation:

- `src/endpoints/character-write-service.js` now coordinates canonical-first create/edit/rename/delete flows, preserves compatibility projection behavior, and records `projection_repairs` instead of silently restoring file authority after DB-committed projection failures.
- `src/endpoints/characters.js` now routes `/create`, `/edit`, `/rename`, `/edit-avatar`, `/edit-attribute`, `/merge-attributes`, `/delete`, `/duplicate`, and `/import` through the same DB-first write seam when `features.storage.canonicalSqlite.writes=true` and the persisted audit gate is clean.
- `src/endpoints/character-store.js` now normalizes canonical row writes so shadow import, DB-first reads, and DB-first writes persist the same route-compatible payload shape.
- `src/canonical-sqlite-migrations.js` now carries a dedicated `canonical_audit_state` migration so pre-existing Phase 1 databases can upgrade cleanly before persisted audit gating or write cutover runs.
- Write-path proof currently lives in `tests/character-write-service.test.js`, `tests/interaction-performance-index.test.js`, `tests/worldinfo-delete-cascade.test.js`, and `tests/third-party-extension-compatibility.test.js`, including explicit projection-failure repair intent, route-level DB-first mutations, delete/world preflight preservation, and compatibility-surface coverage.

### Phase 4: Chat Stats Authority

Goal: maintain character chat stats in canonical SQLite instead of deriving them from scans or dirty index rows.

Deliverables:

- Chat save, rename, delete, and import update `character_chat_stats`.
- Stats rebuild command for recovery from external file changes or projection drift.
- Tests for normal chat mutations and rebuild.
- Recent-chat and character-list consumers read canonical stats where the flag is enabled.

Acceptance:

- Chat message bodies remain JSONL.
- Stats updates are transactional with the route side effect where practical.
- Rebuild command can reconcile from JSONL files without changing message bodies.
- Existing chat export behavior remains unchanged.

### Phase 5: Derived Index Retirement Or Reclassification

Goal: remove ambiguity between canonical storage and derived acceleration.

Deliverables:

- Decision to delete, disable, or reclassify `_cache/character-index.sqlite`.
- Updated interaction performance docs and validation gate selector.
- Removal or rename of stale "character index is the normal list fast path" wording.
- Performance comparison showing DB-first reads meet or exceed current derived-index behavior for target workloads.

Acceptance:

- There is exactly one canonical source for character metadata and chat stats.
- Derived caches are either disabled for this path or documented as non-canonical acceleration.
- Deleting `_cache/character-index.sqlite` cannot lose user data.
- Docs and validation commands reflect the final ownership.

## Task Breakdown And Dependencies

1. `ADR + roadmap docs`
   - Depends on the accepted user direction.
   - Produces ADR-0011, this roadmap, project overview/history sync.

2. `canonical SQLite manager`
   - Depends on Phase 0.
   - Owns DB path resolution, open/close lifecycle, PRAGMA policy, transaction helper, and startup status.
   - Must not reuse derived-cache reset/delete behavior.
   - Current status: delivered in `src/canonical-sqlite.js` with focused tests.

3. `migration runner`
   - Depends on canonical manager.
   - Owns `schema_migrations`, ordered SQL application, idempotency, and migration errors.
   - Current status: delivered in `src/canonical-sqlite-migrations.js` with focused tests.

4. `character store schema`
   - Depends on migration runner.
   - Owns `characters`, `character_chat_stats`, indexes, and projection metadata.

5. `shadow import`
   - Depends on schema.
   - Reads existing PNG cards and chat directories; writes DB rows only.
   - Current status: delivered in `src/canonical-sqlite-shadow-import.js` with focused import/idempotency tests.

6. `audit report`
   - Depends on shadow import.
   - Compares DB state and file projections; records drift without changing either side.
   - Current status: delivered in `src/canonical-sqlite-shadow-import.js` with explicit `migration_not_applied` / `migration_blocked` fail-closed status, machine-readable drift output, and a persisted audit-summary gate for later read cutover.

7. `read service cutover`
   - Depends on audit passing and read flag.
   - Switches character read service to DB-first with parity tests.
   - Current status: delivered for `/api/characters/all`, `/api/characters/list`, and `/api/characters/get` in `src/endpoints/character-read-service.js`, backed by `src/endpoints/character-store.js`, with explicit fallback reasons and stale-audit invalidation on current file-backed mutation paths.

8. `write projection`
   - Depends on read cutover confidence.
   - Updates DB first, then projects compatibility files.

9. `repair tooling`
   - Depends on write projection.
   - Replays projection, rebuilds stats, and reports unrepairable drift.

10. `chat stats authority`
    - Depends on store schema and selected write-side integration.
    - Maintains stats on chat save/rename/delete/import.

11. `derived index retirement`
    - Depends on DB read/write/stats proof.
    - Removes or reclassifies the old character-index sidecar path.

## Feature Flag And Rollback Contract

Use separate flags so each stage can be isolated:

- `features.storage.canonicalSqlite.enabled`
  - master gate; default `false` until Phase 1 is proven.
- `features.storage.canonicalSqlite.shadowImport`
  - allows migration/import/audit without runtime read/write ownership.
- `features.storage.canonicalSqlite.reads`
  - enables DB-first character reads after audit passes.
- `features.storage.canonicalSqlite.writes`
  - enables DB-first character mutation routes plus compatibility projection.
- `features.storage.canonicalSqlite.chatStats`
  - enables DB-maintained chat stats.
- `features.storage.canonicalSqlite.strict`
  - test/development gate that turns fallback into failures for proof.

Rollback rules:

- Phase 1 rollback: disable flags; DB files may remain unused. No file rewrite is needed.
- Phase 2 rollback: disable `reads`; routes return to file-backed reads. DB remains available for audit.
- Phase 3 rollback: disable `writes` only after audit confirms projected files include all DB-committed changes needed by file-backed mode.
- Phase 4 rollback: disable `chatStats`; rebuild or mark derived stats dirty before trusting file-backed scans.
- Phase 5 rollback: only possible if the derived index path has not been deleted or if DB-first reads have equivalent file-backed recovery proof.

Fail-closed rules:

- Unsupported `node:sqlite` disables canonical mode unless `strict` is enabled, in which case startup/test should fail.
- Failed migrations disable canonical reads/writes for that user and surface an operator-visible reason.
- Audit drift blocks read/write cutover unless explicitly overridden in test-only strict fixtures.
- Projection failure records repair intent and must not silently treat projected files as canonical.

## Related Semantic IDs And Code Binding Points

No new user-facing semantic product ID is introduced by this roadmap. Existing user-facing surfaces remain:

- `feature.character_library_panel`
- `page.chat_workspace`
- `feature.world_info_panel`
- `feature.character_delete`
- `feature.world_book_delete`

Code binding points:

- `getUserDirectories(handle)` remains the source for per-user data roots.
- `character-read-service.js` owns character read coordination.
- `character-write-service.js` owns core character write sequencing.
- `chats.js` owns chat save/rename/delete/import route side effects.
- `character-index.js` remains derived until Phase 5 retires or reclassifies it.

## Validation

Docs-only Phase 0:

```bash
bun run docs:check
```

Phase 1 focused tests:

```bash
bun run --cwd tests test:unit -- character-read-service.test.js character-write-service.test.js chat-route-service.test.js --runInBand
```

Derived-cache guard tests while both paths coexist:

```bash
bun run --cwd tests test:unit -- derived-cache-sqlite.test.js interaction-performance-index.test.js --runInBand
```

Compatibility-sensitive checks when World Info binding or extension-visible character surfaces are touched:

```bash
bun run --cwd tests test:unit -- worldinfo-delete-cascade.test.js world-info-shell-context.test.js --runInBand
bun run test:compat
```

Route-order checks if startup or middleware registration becomes involved:

```bash
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
```
