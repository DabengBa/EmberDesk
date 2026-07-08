# Canonical World Info Authority Processing Flow

## Purpose

This document describes the current backend processing rules for canonical World Info authority. It covers server-side storage, audit, read/write routing, projection repair, and fallback behavior. It does not describe the World Info editor UI; user-facing semantics belong to `.docs/db/features/world-info-panel.md` and `.docs/db/features/world-book-delete.md`.

## Inputs

- `features.storage.canonicalSqlite.enabled`
- `features.storage.canonicalSqlite.shadowImport`
- `features.storage.canonicalSqlite.reads`
- `features.storage.canonicalSqlite.writes`
- `features.storage.canonicalSqlite.strict`
- per-user `storage/emberdesk.sqlite`
- compatibility files under `DATA_ROOT/<handle>/worlds/*.json`
- persisted audit state row with `audit_scope = "world_info"`

## Processing Stages

1. Schema migration creates `world_books`, `world_book_entries`, and `world_info_projection_repairs` in the per-user canonical SQLite database.
2. Shadow import scans `worlds/*.json`, parses each World Info JSON payload, normalizes the canonical book name to the projection-safe file id, and upserts canonical rows without rewriting the JSON files.
3. Audit compares JSON projections with canonical rows:
   - missing DB row -> `missing_db_world_info`
   - payload mismatch -> `payload_mismatch`
   - missing JSON projection for a live canonical row -> `missing_projection_file`
   - parse or read failure -> `audit_error`
4. A clean audit is persisted to `canonical_audit_state` with scope `world_info`; any drift persists a blocking state.
5. `/api/worldinfo/list` and `/api/worldinfo/get` read from canonical SQLite only when canonical storage is enabled, reads are enabled, migrations are current, and the `world_info` audit is clean.
6. If reads are blocked and strict mode is off, the routes fall back to compatibility JSON files.
7. If reads are blocked and strict mode is on, the route fails closed instead of silently falling back.
8. `/api/worldinfo/import`, `/edit`, and `/delete` write canonical SQLite first when canonical writes are enabled and the same read gate is clean.
9. After a canonical write commits, EmberDesk projects the compatible JSON file operation.
10. If canonical reads are enabled but writes are disabled, file-backed import/edit/delete/cascade paths invalidate the `world_info` audit after a successful file mutation so DB-first reads cannot keep serving stale canonical rows.
11. If projection fails, the canonical row remains authoritative and a `world_info_projection_repairs` row records the repair intent.
12. Operator repair replays the JSON projection from canonical rows for import/edit repairs; delete repairs remove the projected JSON file and do not require a live canonical row.
13. Successful operator repair resolves the repair row and invalidates the `world_info` audit so operators must re-audit before claiming clean rollback.

## Outputs

- Route-compatible `/api/worldinfo/list` payloads: `{ file_id, name, extensions }[]`
- Route-compatible `/api/worldinfo/get` payloads: the stored World Info JSON object
- `canonical_audit_state` row scoped to `world_info`
- `world_info_projection_repairs` rows for unresolved JSON projection drift
- JSON projection files for import/export/rollback compatibility

## Failure And Degradation Rules

- Disabled canonical flags preserve file-backed behavior.
- Missing or dirty `world_info` audit blocks DB-first reads/writes.
- Strict mode converts blocked canonical reads into failures for proof.
- File-backed writes in mixed read/write rollout mode invalidate `world_info` audit state after the compatibility file changes.
- Projection failure after a canonical write does not restore JSON files as truth.
- Rollback blocker reporting includes unresolved `world_info_projection_repairs` rows.
- Existing World Info converter, import-result, shell-context, delete-cascade, and extension-visible surfaces remain compatibility boundaries.

## Sandbox Proof

Run:

```bash
uv run python .docs/logic-description/canonical_world_info_authority_sandbox_proof.py
```

The proof models import, audit, DB-first read gating, mixed-mode file-write invalidation, write projection failure, edit/delete repair replay, and audit invalidation.
