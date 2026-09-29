# ADR-0016: Per-Slice Compatibility Projection Mode

- Status: Accepted
- Date: 2026-10-22
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none
- Amends: ADR-0011, ADR-0015

## Context

ADR-0011 keeps compatibility files as continuously synced projections of canonical SQLite. Retiring third-party-style file contracts requires stopping that projection one slice at a time — the risky part is that an intentionally stale file is indistinguishable from a broken one, so the audit machinery added in ADR-0015 would misreport deliberate divergence as damage (or worse, re-import stale data over the canonical DB).

## Decision

Each slice gains a projection mode, resolved per slice via `features.storage.canonicalSqlite.slices.<flagKey>.projection` (or the matching `EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_SLICES_*_PROJECTION` env var):

- `sync` — every canonical commit re-materializes the compatibility file and records `origin: 'projection'` in the import ledger. This is the unchanged ADR-0011 behavior.
- `off` — the file is an export/import surface only. Canonical commits do not write it, audits treat file-side drift (stale, edited, malformed, or missing) as suppressed informational entries — never blocking — while open projection repairs still block. Explicit operator actions (`export-all`, `repair-*-projection`) still write the file and record the ledger hash.

`secrets` is the first slice whose default flips to `off` (it is purely internal with no user-facing file contract). Other slices remain `sync` until their own rollout.

## Consequences

- Under `off`, `secrets.json` staleness is expected and non-blocking; the DB is the only authority. Out-of-band file edits are reported but never imported — controlled import remains available through shadow import's marker-guarded path and `export-all` for materialization.
- Repair tooling stays mode-aware: `repair-secret-projection` deliberately writes the file regardless of mode (explicit operator request) and records the ledger entry so follow-up audits classify it `known`.
- Rollback safety is unchanged: `export-all` before deploying a file-authoritative build remains the only supported rollback path.
- Slices flip in risk order (`secrets → settings → world_info → chats → managed_media → characters`); each flip requires the audit suppression semantics proven here plus any slice-specific export/read path.
- `world_info` adds a directory-shaped projection (one file per book) and a cross-slice binding: delete preflight and `/delete-cascade` resolve bound characters from the canonical `characters.world_name` column and clear them by rewriting canonical `card_json`/`shallow_json`, so character PNG files no longer participate in World Info runtime behavior. PNG rewriting remains the explicit fallback when the characters slice is unavailable.
