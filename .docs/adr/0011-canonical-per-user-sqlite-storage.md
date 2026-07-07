# ADR-0011: Canonical Per-User SQLite Storage

- Status: Accepted
- Date: 2026-07-07
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none

## Context

EmberDesk has historically treated files under `DATA_ROOT/<handle>/` as the canonical user-data source. That model keeps user data portable and SillyTavern-compatible, but the character-library hot path already depends on derived acceleration: `DiskCache`, `_cache/character-index.sqlite`, character read/write services, and chat-stat dirty marking.

The derived SQLite slice is intentionally disposable. ADR-0009 rejected Drizzle for that derived sidecar and preserved delete-and-rebuild recovery for `_cache/character-index.sqlite`. That decision does not answer whether a separate SQLite store may become canonical for carefully approved slices.

The new storage question is narrower: should EmberDesk allow a per-user canonical SQLite store for character metadata and chat stats while preserving compatibility-facing files and APIs during rollout?

## Decision

Accept per-user canonical SQLite storage as an approved architecture direction for selected slices.

The first approved target is character metadata plus character chat stats. The canonical database must live outside `_cache`, for example `DATA_ROOT/<handle>/storage/emberdesk.sqlite`. Existing derived caches, including `DiskCache` and `_cache/character-index.sqlite`, must not be promoted in place to canonical storage.

Compatibility files remain required projection/import/export surfaces until a later explicit compatibility-retirement decision. After a slice cuts over, out-of-band file edits are not automatically authoritative; they require a deliberate import, rescan, or repair path.

## Rationale

1. Large character libraries already need structured, queryable state to avoid repeated PNG parsing and chat-directory scans.
2. Promoting `_cache/character-index.sqlite` would make a disposable recovery path unsafe; a new canonical store keeps cache failure semantics separate from data durability.
3. Character metadata and chat stats are the smallest useful authority slice because existing read/write services already localize the route impact.
4. Chat message bodies, full World Info, secrets, settings, vectors, assets, personas, and extension storage have broader compatibility and migration risk and are not part of this first decision.
5. Express 5 remains the runtime owner per ADR-0010, so this storage decision must fit the existing Node/Bun/Express boundary instead of introducing a Rust/Axum/Postgres backend.

## Consequences

Positive:

- EmberDesk can move hot structured state out of repeated filesystem scans without waiting for a full storage rewrite.
- Canonical data durability and cache rebuild behavior become separate concerns.
- Future migrations can use explicit schema history, audit reports, feature flags, and rollback paths.

Negative:

- The project now has two data-authority modes during migration: file-backed surfaces and approved SQLite-backed surfaces.
- Compatibility file projection can drift from the canonical database and therefore needs repair tooling and operator-visible diagnostics.
- Users who manually edit projected files after cutover need an explicit rescan/import workflow rather than assuming those files are live truth.

Neutral clarifications:

- This ADR does not change the current runtime behavior by itself.
- This ADR does not adopt Drizzle or any ORM by default.
- This ADR does not authorize moving chat message bodies or full World Info entries into SQLite.
- This ADR does not weaken extension, import/export, or `/api/characters/*` compatibility contracts.

## Rollout Requirements

The storage roadmap in [Canonical SQLite Storage Roadmap](../tech/canonical-sqlite-storage-roadmap.md) owns the phase gates, task order, feature flags, rollback behavior, and validation matrix.

At minimum, implementation must provide:

- shadow import/audit before DB-first reads
- feature-flagged read and write cutover
- compatibility projection for PNG card and JSONL-adjacent surfaces
- repair tooling for DB/file projection drift
- focused tests for migration idempotency, route response parity, chat-stat updates, and rollback
- docs updates when a slice changes user-visible storage or operator behavior

## Evidence

- [Canonical SQLite Character Metadata And Chat Stats Intent](../tech/briefs/260707-01-canonical-sqlite-character-metadata-chat-stats.md)
- [Canonical SQLite Storage Roadmap](../tech/canonical-sqlite-storage-roadmap.md)
- [Canonical SQLite Store Manager](../tech/canonical-sqlite-store-manager.md)
- [ADR-0009: Derived Cache SQLite Drizzle Decision](0009-derived-cache-sqlite-drizzle-decision.md)
- [ADR-0010: Express Runtime Owner Boundary](0010-express-runtime-owner-boundary.md)
- `src/canonical-sqlite.js`
- `src/storage-feature-flags.js`
- `src/user-directories.js`
- `tests/canonical-sqlite.test.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/chats.js`
- `src/endpoints/character-index.js`
