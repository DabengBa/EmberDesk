# Canonical Secrets Authority Processing Flow

## Purpose

This document describes the current backend processing rules for canonical secret authority. It covers migration, audit, `SecretManager` backend selection, transactional mutation, compatibility projection, repair, and rollback. User-visible API Configuration behavior belongs to [API Configuration](../db/pages/api-configuration.md).

## Goals And Non-Goals

- Keep `SecretManager` and its exported helpers as the only runtime access boundary.
- Preserve record IDs, labels, one active record per secret key, masking, exposure gates, and CUSTOM-to-OPENAI migration.
- Keep audit, logs, repair state, operator status, and test snapshots free of plaintext secret values.
- Do not claim that SQLite or its backups encrypt secret values at rest.

## Inputs

- `features.storage.canonicalSqlite.enabled`
- `features.storage.canonicalSqlite.shadowImport`
- `features.storage.canonicalSqlite.reads`
- `features.storage.canonicalSqlite.writes`
- `features.storage.canonicalSqlite.strict`
- per-user `storage/emberdesk.sqlite`
- compatibility file `DATA_ROOT/<handle>/secrets.json`
- persisted audit state with `audit_scope = "secrets"`
- existing `allowKeysExposure` and exportable-key rules

## Processing Stages

1. Migration v5 creates `secret_records`, one-active-per-key uniqueness, `secret_migration_markers`, and `secret_projection_repairs`.
2. Startup migration keeps the existing flat-to-array and CUSTOM-to-OPENAI behavior, then initializes the canonical secret slice.
3. Shadow import parses flat and array values. Existing array IDs, labels, and active state are retained; unchanged flat values reuse the previously generated canonical ID.
4. Audit compares key, record ID, label, active state, record count, and SHA-256 value hashes. It never returns a plaintext value.
5. The first clean initialization is cached for the process. Later operations still read current persisted audit state and open repair rows before choosing authority.
6. With flags off, `SecretManager` keeps the atomic file backend.
7. With canonical reads enabled and a clean audit, reads use `secret_records`. Ordinary state remains masked by the existing manager logic.
8. Canonical writes require reads, writes, a clean audit, legal flags, and no open secret projection repair.
9. Write, delete, rotate, and rename mutate canonical rows transactionally. The partial unique index and transaction order keep at most one active row per key.
10. After commit, EmberDesk atomically projects the complete canonical state to `secrets.json`.
11. Projection failure records only repair key, secret key, optional record ID, operation, error class, and timestamps. The committed DB value remains authoritative.
12. While a secret projection repair is open, reads continue from SQLite and later canonical writes fail closed.
13. Operator repair regenerates `secrets.json` only from canonical rows, resolves the repair, and invalidates the audit so rollback requires a fresh clean audit.

## Outputs

- canonical `secret_records`
- scoped `canonical_audit_state` summary
- sanitized `secret_projection_repairs`
- route-compatible masked secret state
- atomic `secrets.json` compatibility projection

## Failure And Degradation Rules

- Disabled flags preserve the current file backend.
- Dirty audit before DB-first cutover falls back to the file backend unless strict mode requires failure.
- Open projection repair never restores file authority; reads remain DB-first and writes are blocked.
- Invalid or unreadable `secrets.json` produces error class metadata only.
- Rollback is blocked until the audit is clean, projection is current, and no repair remains open.
- Database files and backups contain plaintext secret values; operational backup protection remains required.

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/canonical_secrets_authority_sandbox_proof.py
```

The proof models idempotent import, one-active rotation, hash-only audit, DB-authoritative projection failure, sanitized repair metadata, repair replay, and rollback blockers.
