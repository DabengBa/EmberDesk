---
description: "Canonical per-user SQLite is the authority for structured state; files and derived caches are projections or exports, with repair, conflict, and legacy-migration boundaries defined here."
kind: adr
topic: canonical-sqlite-authority
id: "ADR-0001"
status: active
supersedes: null
created_at: 2026-11-26
affects_symbols:
  - "src/canonical-sqlite.ts#DEFAULT_CANONICAL_SQLITE_FILENAME"
  - "src/endpoints/character-store.ts#normalizeCanonicalCharacterPayload"
  - "src/endpoints/world-info-store.ts#getCanonicalWorldInfoBook"
---

# Canonical SQLite Authority

## Context

EmberDesk historically treated user-root files and a derived sidecar index as storage truth. That made drift, partial writes, and crash recovery ambiguous: a file rewrite could silently override a newer database state, and deleting a cache could look like recovery. The project accepted comprehensive per-user SQLite authority to establish one write boundary for structured state while keeping file formats for compatibility and explicit operator workflows.

## Decision

The canonical per-user SQLite database is the authority for structured state. PNG cards, World Info JSON, chat JSONL, `settings.json` remnants, and `_cache`/DiskCache entries are projections, export formats, or rebuildable derived caches. Cache deletion or file overwrite cannot substitute for authority recovery: recovery rechecks the current canonical state. Revisioned conditional writes (`expectedRevision`/`expected_card_json` with 409 conflicts) coordinate participating writers only; they do not arbitrate legacy processes or out-of-band file edits. Projection repair is recorded with the canonical mutation, and replay rechecks the current authority under the SQLite writer lock; unknown repairs are rollback blockers. Legacy `public/worlds` is not migrated automatically—stop the server and handle those files offline. Authority does not require normalizing every byte or low-frequency nested domain: a revisioned canonical JSON document with one write boundary and unknown-field preservation is valid authority. SQLite owns stable identity, lifecycle, relationships, audit state, and content references where enforcement matters; large blobs may remain managed files. Express 5 remains the backend host; Rust/Axum, PostgreSQL, and a new server host are out of scope.

## Rejected

- Treating `_cache/character-index.sqlite` or DiskCache as canonical or as a fallback authority; derived caches must be disposable without data loss.
- Deleting or rewriting a corrupt projection/cache file as recovery, or letting a projected file silently roll back committed canonical rows.
- Extending revision/409 conflict semantics to older processes or arbitrary external file edits; those writers do not participate in the protocol.
- Normalizing every nested field into tables merely to claim authority; this adds migration cost without strengthening the write boundary.
- Replacing the Express 5 host with Rust/Axum, adding PostgreSQL, or introducing another server runtime for canonical storage.
- Automatically migrating legacy `public/worlds`; offline handling is required to avoid races with a live server.

## Constraint

Canonical data MUST NOT live under `_cache` or in rebuildable caches. A projection repair MUST recheck current authority under the SQLite writer lock before modifying a projection, and unresolved repairs MUST block rollback. Projections and exports MUST NOT become a second runtime authority; only explicit operator import/export surfaces may materialize files. Legacy file formats remain compatibility/export surfaces, not writable truth, and unrelated legacy directories keep their existing migration behavior.
