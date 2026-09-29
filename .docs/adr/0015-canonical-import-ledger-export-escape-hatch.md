# ADR-0015: Canonical Import Ledger and Export Escape Hatch

- Status: Accepted
- Date: 2026-10-16
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none

## Context

ADR-0011 made per-user canonical SQLite the authority for approved slices while keeping compatibility files as projection/import/export surfaces. That left two operational gaps:

1. Once compatibility files stop being a second authority, an audit that compares file bytes to canonical rows cannot distinguish "the file changed out-of-band" from "the DB moved ahead and the projection lags". Both look like the same mismatch, so the safe default was to block and wait for repair — which also means a deliberately dropped-in file cannot heal itself.
2. If a future phase stops continuous projection, files on disk go stale the moment the last write happens. Rolling back to a file-authoritative build at that point silently serves old data. Rollback therefore needs an explicit materialization step, not just a deploy.

## Decision

Add a per-slice import ledger (`import_ledger`, migration v10) recording `(slice_key, source_path, content_hash, origin, imported_at_ms)` where `origin` is `import`, `projection`, or `export`. The hash is the last file content canonical storage accounted for.

Audits classify every file-driven drift entry through the ledger:

- `candidate` — file hash differs from the ledger record (or is untracked). The file moved since canonical storage accounted for it; shadow import is the correct heal. An audit containing candidate file drift persists reason `audit_stale_file_changes`, which the lazy initializer already routes to `import` before re-auditing.
- `known` — file hash matches the ledger. Any remaining divergence lives on the DB side (projection lag or DB-ahead state); the audit stays `audit_drift_blocked` until repair replays the projection. Re-importing a known file is forbidden because it would regress newer canonical state.

Audit entries carry `details.import_classification` so operators and repair tooling can see the direction of every mismatch.

All writers keep the ledger accurate at the moment they touch a file:

- Shadow importers record `origin: 'import'` **after** a successful row upsert or unchanged determination — never before, so a failed import cannot mark a file as accounted.
- Projection writers record `origin: 'projection'` immediately after the compatibility write succeeds; file deletes remove the ledger entry.
- `export-all` records `origin: 'export'` for every file it materializes.

Invalidate semantics are unified: operation strings (e.g. `user_image_upload:x`) go to `source`, and `reason` uses the `audit_stale_*` taxonomy so every file-side mutation routes to `import`-heal instead of landing as an unhandled blocking reason.

`canonical-sqlite-repair.mjs export-all [--slice <key>] [--out-dir <path>]` materializes canonical rows back into the compatibility file tree (or a staging root), including PNG card synthesis from card data plus the best available avatar image, and writes `export-manifest.json` with per-slice counts and the ledger snapshot. This is the rollback escape hatch: deploying a file-authoritative build requires running `export-all` first.

## Consequences

Positive:

- Out-of-band file changes discovered by an audit heal via re-import instead of blocking for manual repair — files behave as an inbox, matching the "file = import candidate" semantics the retirement roadmap requires.
- Rollback from a projection-off state is a defined procedure (`export-all`, then deploy the older build) instead of an implicit data-loss risk.
- The ledger makes every later phase (per-slice `projection: 'off'`, avatar blobs, upload-direct-to-DB) implementable without re-deriving provenance.

Negative / constraints:

- Audit classification depends on ledger accuracy; any new file-writing path must record or remove ledger entries. Misses show up as spurious 'candidate' classifications, which still converge through re-import.
- `export-all` is a whole-tree materialization, not a point-in-time backup; chat backup/restore remains the granular recovery path.
- Character avatar images are not yet canonical blobs (Phase P1 of the retirement plan); `export-all` synthesizes PNGs from `card_json` plus the current file, an avatar blob, or the default avatar — card data is never stranded, but a missing avatar source degrades image fidelity, not data.
