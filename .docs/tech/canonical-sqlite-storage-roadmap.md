# Canonical SQLite Storage Roadmap

## Module Responsibility

This document owns the executable roadmap for ADR-0011's canonical per-user SQLite storage direction. It defines the first storage slice, phase acceptance gates, task order, feature flags, rollback rules, and validation expectations.

Primary current files:

- `src/canonical-sqlite.js`
- `src/canonical-storage-slice-registry.js`
- `src/canonical-sqlite-rollout-contract.js`
- `src/canonical-sqlite-operator.js`
- `src/storage-feature-flags.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/chats.js`
- `src/endpoints/character-index.js` (retired helper; no normal runtime ownership)
- `src/derived-cache-sqlite.js`
- `src/users.js`
- `src/user-directories.js`

Future implementation candidates:

- `src/endpoints/character-store-migrations.js`

Delivered Phase 1 tech docs:

- `canonical-sqlite-store-manager.md`
- `canonical-sqlite-migration-runner.md`
- `canonical-sqlite-shadow-import-audit.md`

## Architecture And Constraints

ADR-0011 originally accepted canonical per-user SQLite storage for selected slices, beginning
with character metadata plus character chat stats. The 2026-07-13 successor decision confirms
comprehensive database authority as the long-term direction while retaining per-slice rollout
and rollback gates.

That first approved slice is now delivered, the legacy-mode accelerator around
`_cache/character-index.sqlite` has been retired from normal runtime, and full World Info
authority is delivered. Settings, secrets, and managed media are also delivered authority
slices. The remaining work is ordered by system invariant and current runtime ownership:

1. maintain generic per-slice flags, global fallback, registry/operator contracts, and migration tests
2. establish canonical chat schema, stable IDs, lossless JSONL shadow import, and audit
3. cut character/group chat full-payload reads and writes over to canonical SQLite
4. complete chat search/recent indexes, attachments, backup/restore, repair, and Node 26 proof
5. harden extension Git operations without inventing a per-user owner for the global registry
6. retain old vector indexes only as rollback/export-compatible derived data; first-party vector runtime is retired and is not a canonical-storage work item

The canonical DB must be separate from derived caches:

- canonical candidate: `DATA_ROOT/<handle>/storage/emberdesk.sqlite`
- retired derived sidecar: `DATA_ROOT/<handle>/_cache/character-index.sqlite`
- disk extraction cache: `DiskCache`

Do not place canonical data under `_cache`. Do not reuse `src/derived-cache-sqlite.js` as the canonical DB manager because its reset, corrupt-file removal, circuit-breaker, and fallback semantics are intentionally designed for rebuildable sidecars.

Compatibility remains a hard boundary:

- `/api/characters/*` response shapes stay stable.
- Character avatar filenames remain visible compatibility identifiers.
- PNG card import/export remains available.
- Chat JSONL import/export remains available through the chat migration.
- Full World Info authority is delivered; JSON files remain compatibility projection/import/export surfaces.
- Extension-visible globals and `@sillytavern/*` imports remain frozen unless a later compatibility retirement decision says otherwise.

Comprehensive database authority does not require every byte or every low-frequency nested
subdomain to be normalized into separate SQLite tables. A revisioned canonical JSON document
is valid authority when it preserves one write boundary and unknown fields, as settings does
for personas and `extension_settings`. SQLite owns structured state, stable identity,
relationships, lifecycle, audit status, and content references where those properties need
independent enforcement. Large images, audio, and attachments may remain managed files.
Extension Git worktrees remain filesystem/Git runtime authority until a separate server-wide
registry decision exists.

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
- `src/endpoints/character-file-snapshot.js` now exists as the shared file-backed snapshot helper reused by direct compatibility-file reads and canonical shadow import.
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
- Once canonical reads are requested, `src/endpoints/character-read-service.js` now falls back directly to compatibility files when canonical rows are blocked or missing instead of reviving `_cache/character-index.sqlite` as a second authority path.
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
- `src/canonical-sqlite-rollout-contract.js` now centralizes legal flag combinations, unresolved repair visibility, and rollback-blocker derivation for the current slice instead of scattering those checks across route code.
- `src/canonical-sqlite-migrations.js` now carries a dedicated `canonical_audit_state` migration so pre-existing Phase 1 databases can upgrade cleanly before persisted audit gating or write cutover runs.
- Write-path proof currently lives in `tests/character-write-service.test.js`, `tests/canonical-sqlite-rollout-contract.test.js`, `tests/canonical-sqlite-shadow-import.test.js`, `tests/interaction-performance-index.test.js`, `tests/worldinfo-delete-cascade.test.js`, and `tests/third-party-extension-compatibility.test.js`, including explicit projection-failure repair intent, strict write-blocking, rollback blocker derivation, delete/world preflight preservation, and compatibility-surface coverage.

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
Current delivered foundation:

- `src/endpoints/chats.js` now updates canonical `character_chat_stats` directly after successful character chat save, rename, delete, and import side effects when `features.storage.canonicalSqlite.chatStats=true`.
- Group chat save/import/delete paths remain outside character chat stats authority, and chat message bodies continue to use JSONL files.
- `src/endpoints/character-store.js` and `src/endpoints/character-read-service.js` now treat canonical chat stats as a separate runtime boundary: canonical reads only inject `chat_size` / `date_last_chat` when `features.storage.canonicalSqlite.chatStats=true`.
- `src/canonical-sqlite-operator.js` and `scripts/canonical-sqlite-repair.mjs` now provide an explicit `rebuild-chat-stats` operator path for the current slice.
- Focused proof currently lives in `tests/interaction-performance-index.test.js`, `tests/character-read-service.test.js`, `tests/canonical-sqlite-operator.test.js`, `tests/canonical-sqlite-cli.test.js`, and `tests/chat-route-service.test.js`.

### Phase 5: Derived Index Retirement Or Reclassification

Goal: remove ambiguity between canonical storage and derived acceleration.

Deliverables:

- Decision to delete, disable, or reclassify `_cache/character-index.sqlite`.
- Updated interaction performance docs and validation gate selector.
- Removal or rename of stale "character index is the normal list fast path" wording.
- Focused route proof showing character reads fall back to canonical SQLite or compatibility files without requiring the retired derived sidecar; future performance work should optimize canonical queries rather than restore `_cache/character-index.sqlite`.

Acceptance:

- There is exactly one canonical source for character metadata and chat stats.
- Derived caches are either disabled for this path or documented as non-canonical acceleration.
- Deleting `_cache/character-index.sqlite` cannot lose user data.
- Docs and validation commands reflect the final ownership.

Current delivered foundation:

- `src/endpoints/character-read-service.js` now skips `_cache/character-index.sqlite` in canonical DB-first mode and in compatibility fallback mode, so `/api/characters/all`, `/list`, and `/get` never take a normal indexed path.
- Character create/edit/import/delete, chat save/rename/delete/import, and World Info delete-preflight/cascade no longer refresh, delete, dirty-mark, or query `_cache/character-index.sqlite`.
- `src/server-main.js` no longer logs or disposes character-index sidecar state during normal startup/shutdown.
- `src/endpoints/character-index.js` remains only as a retired helper for historical tests and interaction-performance report compatibility until a later cleanup deletes or archives it.
- Validation and docs now treat `derived-cache-sqlite.test.js` plus `interaction-performance-index.test.js` as helper/historical proof, not as a required sidecar availability gate.

## Delivered Follow-On Slice: Full World Info

Full World Info is no longer an active planning question.

Current delivered foundation:

- `src/canonical-sqlite-migrations.js` now includes the `world_info_authority` migration with `world_books`, `world_book_entries`, and `world_info_projection_repairs`.
- `src/endpoints/world-info-store.js` owns canonical World Info row normalization to projection-safe file ids, route-compatible list/get payload reconstruction, DB-first write helpers, and open projection-repair listing.
- `src/canonical-world-info-shadow-import.js` imports existing `worlds/*.json` files idempotently, audits DB/file projection drift, and persists `canonical_audit_state` scope `world_info` as the fail-closed read/write gate.
- `src/endpoints/worldinfo.js` now serves `/api/worldinfo/list` and `/get` from canonical SQLite when canonical read flags are enabled and the `world_info` audit is clean; it falls back to JSON files when flags are off or audit is blocked, strict mode fails closed, and mixed-mode file writes invalidate `world_info` audit state.
- `/api/worldinfo/import`, `/edit`, and `/delete` can commit canonical SQLite first behind canonical write flags, then project compatibility JSON files; projection failure records `world_info_projection_repairs` rather than restoring JSON files as truth.
- `src/canonical-sqlite-operator.js` can replay World Info projection repairs, resolve delete repairs without requiring a live canonical row, include `world_info_projection_repairs` in write rollback blockers, and resolve the repair row after the JSON projection state is restored.
- `scripts/canonical-sqlite-audit.mjs --scope world_info` and `scripts/canonical-sqlite-repair.mjs audit-world-info|list-world-info-repairs|repair-world-info-projection` expose the World Info audit and repair paths to operators.
- Existing converter/import-result, shell-context, delete-cascade, and third-party extension compatibility tests remain the proof that `public/scripts/world-info.js` and protected surfaces stay compatible.

## Delivered Control Plane: Canonical Storage Slice Registry

The character and World Info rollout patterns are now registered behind a shared control plane
without moving new business domains into SQLite.

Current delivered foundation:

- `src/canonical-storage-slice-registry.js` owns stable slice keys (`characters`, `world_info`,
  `settings`, `secrets`, and `managed_media`), each descriptor's flag key, required capability
  registration, default registry bootstrap, backup manifest construction, and backup/restore
  readiness checks.
- `src/storage-feature-flags.js` resolves optional per-slice values field-by-field, preserving the
  existing global flag result whenever a slice value is absent. Explicit malformed slice values
  fail closed with `invalid_slice_flag_configuration`; managed media retains its independent,
  no-global-fallback contract.
- `src/canonical-sqlite-rollout-contract.js` provides generic flag legality and
  per-slice rollback-blocker builders; character-only compatibility helpers remain for existing
  call sites.
- `src/canonical-sqlite-operator.js` aggregates machine-readable multi-slice status, including
  effective flags, per-flag sources, fail-closed resolver blockers, audit/repair routing, and
  backup/restore readiness without user content or secrets.
- Character, chat-stat, World Info, settings, secrets, and managed-media adapters resolve their
  current gates through registered slice descriptors, so one slice's override, drift, or open
  repair does not disable unrelated slice status.
- Operator CLIs expose `status`, `--slice`, and keep existing character/World Info commands.
- Backup/restore readiness only compares database + managed-file inventory and manifest
  completeness; it never auto-overwrites the database or compatibility files.
- Focused proof lives in `tests/canonical-storage-slice-registry.test.js`,
  `tests/canonical-sqlite-operator.test.js`, `tests/canonical-sqlite-cli.test.js`,
  `tests/canonical-sqlite-rollout-contract.test.js`, and existing character/World Info route tests.

## Active Comprehensive Database Sequence

Delivered packages remain optional process records. The active packages below are intentionally
smaller than the superseded persona/extension/chat/vector plans so each risk has one rollback gate.

| Order | Package | Authority outcome | True dependency |
|---|---|---|---|
| 1 | Canonical chat foundation | Delivered: chat schema, stable session/message IDs, lossless JSONL shadow import and audit; `shadow_only`, with no runtime cutover | Delivered slice-gate maintenance; delivered managed media |
| 2 | Canonical chat authority cutover | DB-first full-payload get/save/rename/delete/import/export with JSONL projection repair | Order 1 clean audit |
| 3 | Canonical chat query recovery | Search/recent indexes, attachment integrity, backup/restore, operator repair, Node 26 proof | Order 2 |
| 4 | Extension operation safety | Safe Git preflight and structured failures while filesystem/Git remains authority | Existing extension compatibility contracts; independent of chat |
| 5 | Derived vector index hardening | Stable source refs, atomic derived generations, last-complete fallback and rebuild | Order 3; stable World Info/media IDs |

Persona records, defaults and connections remain inside the revisioned canonical settings
document; persona avatars remain managed media; persona/background chat locks move with
`chat_metadata`. No separate persona implementation package is currently justified.

Extension discovery and worktrees remain filesystem/Git-owned because global extensions are
server-wide while canonical SQLite is per-user. `extension_settings` remains in canonical
settings. A future server-wide extension registry requires a separate ADR.

Chat server pagination is explicitly deferred. Current `/get` returns a complete chat and
`showMoreMessages()` slices the already-loaded browser array, so pagination is a separate
product/performance contract rather than a hidden requirement of storage migration.

Vectra, chunks, and generation manifests remain deletable derived state. They reference stable
canonical source IDs but do not become a second text authority.

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
   - Current status: delivered for current character mutation routes, with strict blocker propagation and enriched repair metadata for projection replay.

9. `repair tooling`
   - Depends on write projection.
   - Replays projection, rebuilds stats, and reports unrepairable drift.
   - Current status: delivered for the first slice and full World Info via `src/canonical-sqlite-operator.js`, `scripts/canonical-sqlite-audit.mjs`, and `scripts/canonical-sqlite-repair.mjs`.

10. `chat stats authority`
   - Depends on store schema and selected write-side integration.
   - Maintains stats on chat save/rename/delete/import.
   - Current status: delivered for character chats behind `features.storage.canonicalSqlite.chatStats`; chat save/rename/delete/import now update canonical stats directly, group chats remain excluded, and `rebuild-chat-stats` remains the repair path for external file drift.

11. `legacy-mode accelerator retirement`
    - Depends on DB read/write/stats proof.
    - Removes the remaining old character-index sidecar path from normal runtime operation.
    - Current status: delivered; normal character reads/writes/chat mutations/World Info delete flows no longer open, refresh, dirty-mark, or query `_cache/character-index.sqlite`.

12. `full World Info canonical migration`
    - Depends on legacy-mode accelerator retirement.
    - Moves full World Info entries into canonical SQLite with compatibility-safe prompt, regex, import/export, and delete-cascade behavior.
    - Current status: delivered via `src/endpoints/world-info-store.js`, `src/canonical-world-info-shadow-import.js`, `src/endpoints/worldinfo.js`, World Info projection repair support in `src/canonical-sqlite-operator.js`, and World Info audit/repair commands in the canonical SQLite scripts.

13. `canonical storage control-plane generalization`
    - Depends on the delivered character and World Info patterns.
    - Produces slice registration, audit/repair routing, rollback blockers, backup/restore
      status and operator reporting without changing new domain authority yet.
    - Current status: delivered via `src/canonical-storage-slice-registry.js`,
      generalized `src/canonical-sqlite-rollout-contract.js`,
      multi-slice operator status in `src/canonical-sqlite-operator.js`,
      CLI `status`/`--slice` in `scripts/canonical-sqlite-repair.mjs` and
      `scripts/canonical-sqlite-audit.mjs`, character/World Info adapters, and
      backup/restore readiness helpers that never auto-rewrite managed files.
    - Flag note: global `features.storage.canonicalSqlite.*` fields remain the compatibility
      fallback. The current descriptor flag keys are `characters` and `worldInfo`, so their
      independent overrides use `features.storage.canonicalSqlite.slices.characters.*` and
      `features.storage.canonicalSqlite.slices.worldInfo.*` without rewriting the route
      branches.

14. `settings document authority`
    - Depends on the generalized control plane.
    - Moves `settings.json`, revisions and snapshot/restore into canonical SQLite while
      preserving the current `/api/settings/get` and `/save` payload.
    - Current status: delivered via migration v4, `src/endpoints/settings-store.js`,
      `src/canonical-settings-shadow-import.js`, DB-first settings routes, projection repairs,
      snapshots, and revision conflict handling.

15. `secrets authority`
    - Depends on the generalized control plane.
    - Moves secret records into canonical SQLite only through `SecretManager`; exposure and
      migration rules remain separate from settings.
    - Current status: delivered via migration v5 `secret_records`,
      `secret_migration_markers`, and `secret_projection_repairs`;
      `src/canonical-secrets-shadow-import.js` performs idempotent flat/array import and
      value-hash audit; `src/canonical-secrets-backend.js` keeps `SecretManager` DB-first
      behind clean read/write gates; operator and CLI repair replay `secrets.json` from the
      database without exposing values in status or repair metadata.
    - Security note: SQLite and database backups contain the same plaintext secret values
      previously held by `secrets.json`; this migration does not provide encryption at rest.

16. `managed media authority`
    - Depends on the generalized control plane.
    - Makes SQLite authoritative for blob identity, media metadata, folders and lifecycle
      while large content remains under a database-managed content root.
    - Current status: delivered through migration v6 (`managed_blobs`, `media_references`,
      `media_folders`, memberships, and `managed_media_repairs`),
      `src/canonical-managed-media-shadow-import.js`,
      `src/endpoints/canonical-managed-media-read-service.js`, and
      `src/endpoints/canonical-managed-media-write-service.js`. The independently gated
      `features.storage.canonicalSqlite.slices.managedMedia.*` slice shadows existing media
      without moving it, permits DB-first background and asset reads only after a clean
      `managed_media` audit, and writes content under
      `storage/managed-media/<sha256>` before projecting compatible paths. Projection failures
      remain durable repairs, reference-aware deletes tombstone final blobs, and
      `gc-managed-media` is dry-run by default until an operator passes `--apply`.

17. `slice gate maintenance`
    - Delivered: generic optional per-slice overrides retain backward-compatible global fallback
      when omitted, operator status reports each effective source, and invalid explicit values fail
      closed.
    - Domain tests now prove their named migration and required schema rather than the unrelated
      catalog tail version.

18. `canonical chat foundation`
    - Adds schema, stable IDs, lossless shadow import and audit without changing JSONL runtime authority.

19. `canonical chat authority cutover`
    - Delivered: complete character/group chat payload reads, writes, and exports use
      canonical SQLite after a clean chat audit while preserving the existing full-array
      route contract and no-pagination behavior.
    - JSONL remains a compatibility projection, explicit import/export, and rollback
      surface; projection failures create durable chat repairs that operator/CLI replay can
      restore.

20. `canonical chat query and recovery`
    - Moves search/recent to canonical indexes and completes attachments, backup/restore,
      operator repair, and Node 26 performance proof.
    - Delivered: `/api/chats/search` and `/api/chats/recent` now use canonical character/group
      query state after a clean chat audit while preserving the existing route payload shape and
      root-chat recent compatibility fallback; canonical writes now reject unregistered managed
      attachment paths before commit; canonical chat backup bundles now bind session payloads,
      projection state, and attachment manifests; restore validates that manifest before
      replacing canonical rows, records a durable restore journal, and re-requires chat audit;
      fixed-scale Node 26.3.0 benchmark proof now lives in
      `scripts/canonical-chat-node26-benchmark.mjs` and its feature evidence artifact.
    - Operators create and restore chat bundles with
      `scripts/canonical-sqlite-repair.mjs backup-chat|restore-chat --backup-file <path>`;
      `chat-restore-status` reports the latest durable restore result.

21. `extension operation safety`
    - Keeps filesystem/Git discovery authority.
    - Unifies safe preflight and structured failures for install/update/switch/move/delete.

22. `derived vector index hardening`
    - Depends on stable canonical source IDs after chat query/recovery.
    - Adds atomic generation publish, last-complete fallback, invalidation, and rebuild while
      keeping chunks, embeddings, and manifests disposable.

## Feature Flag And Rollback Contract

The delivered character/World Info foundation retains its current compatibility flags:

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

The control plane resolves each descriptor's effective flags. For `characters`, `worldInfo`,
`settings`, and `secrets`, an omitted
`features.storage.canonicalSqlite.slices.<flagKey>.<field>` retains the existing global field
result. An explicit slice value overrides only that field for that slice; `chatStats` applies only
to the characters descriptor. Invalid explicit values or malformed slice mappings disable the
affected slice and surface `invalid_slice_flag_configuration` in operator status. This keeps
existing global-only installations compatible while letting later slices use the same contract.
The contract must satisfy these rules:

- enabling one slice does not enable or block an unrelated slice
- `writes` requires that slice's migration, import, audit and `reads` gates
- `strict` converts only that slice's fallback into a proof failure
- vector build/index flags remain separate from canonical source authority
- existing global-only installations retain compatible flag interpretation during migration

Managed media uses the independent
`features.storage.canonicalSqlite.slices.managedMedia.{enabled,shadowImport,reads,writes,strict}`
flags. Global canonical flags do not enable this slice. Background and asset reads use the
catalog only after its persisted audit is clean; disabled, blocked, or non-strict failed reads
continue through existing compatible file paths. Managed writes stage content under
`storage/managed-media/.staging`, register hash-addressed content in the database, and then
project existing paths. Operators use `scripts/canonical-sqlite-audit.mjs --slice managed_media`,
`scripts/canonical-sqlite-repair.mjs list-managed-media-repairs`,
`repair-managed-media-projection`, and `gc-managed-media` (with explicit `--apply` for deletion).

Chats use the global-fallback
`features.storage.canonicalSqlite.slices.chats.{enabled,shadowImport,reads,writes,strict}`
descriptor. After a clean persisted chat audit, `reads` reconstructs the existing complete
header-plus-message payload for character and group `/api/chats/get` and export without server
pagination. `writes` requires `reads`, migration readiness, clean audit, and zero unresolved
`chat_projection_repairs`; illegal or blocked canonical writes return an explicit route failure
instead of silently falling back to JSONL authority. Save, rename, delete, and explicit import
commit canonical rows first, then atomically project JSONL. Projection failure keeps canonical
authority, invalidates the chat audit, and records a replayable repair. Operators can inspect and
replay repairs through `scripts/canonical-sqlite-repair.mjs list-chat-repairs` and
`repair-chat-projection`; repair replay invalidates the audit so a fresh audit is required before
rollback. The importer retains stable session/message identities across repeat import and file
rename, while external JSONL edits remain explicit import/resolve work rather than automatic
authority replacement.

Rollback rules for every new slice:

- Shadow-only rollback disables that slice and leaves imported rows unused.
- Read rollback disables that slice's reads and returns to the audited compatibility source.
- Write rollback requires a clean latest audit, current compatibility projection or managed-file
  manifest, and zero unresolved repair rows for that slice.
- Settings, secrets, chats and managed media must each prove their own
  recovery surface; one slice's clean state cannot waive another slice's blockers.
- Extension operations must never discard dirty worktree changes as a recovery shortcut.
- Vector rollback does not preserve corrupt derived generations; it requires a stable source
  snapshot or a usable last-complete generation.

Fail-closed rules:

- Unsupported `node:sqlite` disables canonical mode unless `strict` is enabled, in which case startup/test should fail.
- Failed migrations disable canonical reads/writes for the affected user and slice and surface an operator-visible reason.
- Audit drift blocks that slice's read/write cutover unless explicitly overridden in test-only fixtures.
- Illegal per-slice flag combinations are blocked by the rollout contract instead of being treated as best-effort opt-ins.
- Projection failure records repair intent, invalidates the persisted audit gate where the route has a committed canonical write, and must not silently treat projected files as canonical. Mixed-mode file-backed writes also invalidate the relevant persisted audit scope when canonical storage is enabled.

## Related Semantic IDs And Code Binding Points

No new user-facing semantic product ID is introduced by this roadmap. Existing user-facing
surfaces affected by later implementation remain:

- `feature.character_library_panel`
- `page.chat_workspace`
- `feature.world_info_panel`
- `feature.character_delete`
- `feature.world_book_delete`
- `page.settings`
- `page.api_configuration`
- `feature.background_library_panel`
- `feature.extension_panel_open`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`
- `term.shared_browser_library`

Code binding points:

- `getUserDirectories(handle)` remains the source for per-user data roots.
- `character-read-service.js` owns character read coordination.
- `character-write-service.js` owns core character write sequencing.
- `chats.js` owns chat save/rename/delete/import route side effects.
- `character-index.js` is retired from normal runtime and remains only as a historical/helper-level proof surface.
- `settings.js`, `secrets.js`, `assets.js`, `backgrounds.js`, and `extensions.js`
  remain their HTTP/facade owners while domain stores move behind them.

## Validation

Docs-only Phase 0:

```bash
pnpm run docs:check
```

Phase 1 focused tests:

```bash
pnpm --dir tests run test:unit -- canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand
```

Operator tooling and rollout-contract proof:

```bash
pnpm --dir tests run test:unit -- canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js validation-gate-selector.test.js --runInBand
```

Derived-cache helper and retired sidecar proof:

```bash
pnpm --dir tests run test:unit -- derived-cache-sqlite.test.js interaction-performance-index.test.js --runInBand
```

Compatibility-sensitive checks when World Info binding or extension-visible character surfaces are touched:

```bash
pnpm --dir tests run test:unit -- canonical-world-info-store.test.js worldinfo-route-service.test.js canonical-sqlite-operator.test.js canonical-sqlite-cli.test.js --runInBand
pnpm --dir tests run test:unit -- worldinfo-delete-cascade.test.js world-info-shell-context.test.js --runInBand
pnpm run test:compat
```

Route-order checks if startup or middleware registration becomes involved:

```bash
pnpm --dir tests run test:unit -- express5-route-compatibility.test.js --runInBand
```
