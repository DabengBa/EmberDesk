---
description: "settings.json has no runtime semantics after canonical removal; the only same-named file is the migrateUserData source, and 503 replaces the deleted file fallback."
kind: adr
topic: settings-json-removal
id: "ADR-0006"
status: active
supersedes: null
created_at: 2026-11-26
affects_symbols:
  - "src/endpoints/settings-store.ts#ensureCanonicalSettingsDocument"
  - "src/canonical-sqlite.ts#CanonicalSqliteDisabledError"
  - "src/command-line.ts#CommandLineParser"
---

# Settings JSON Removal

## Context

`settings.json` accumulated many roles—projection, seed target, shadow import input, fallback read/write, backup path, and repair source—while canonical SQLite already carried the real document. The file write fallback silently discarded saves because the audit invalidation it depended on was itself gated off in production, and the read fallback was unreachable in normal server startup. Keeping those branches promoted a dead file to false authority.

## Decision

`settings.json` has no runtime semantics: EmberDesk does not create, rewrite, read, import, or audit it. The only legitimate file with that name is the migration source `public/settings.json`, read by `migrateUserData`, backed up, and then deleted. File-backed fallback branches are removed; every canonical-unavailable reason returns the same 503 `canonical_storage_unavailable`. Document creation uses `ensureCanonicalSettingsDocument` independently of feature flags and shadow import, so boot, read, write, and reset paths never need a file. Relics of the file role such as `SETTINGS_FILE`, content seeding, file-named snapshots, managed backup paths, and projection repair blockers are retired, while intentional user exports use a distinct artifact name. The audit-stale overwrite risk from a surviving file is recorded as an accepted residual behavior, not a new gate. `secrets.json` is the same-shaped migration problem and reuses this checklist when removed.

## Rejected

- Keeping the 503 fallback branch in `/get` (D1 alternative): it was production-unreachable, produced an unlabeled 500 on a missing file, and hid a write path that silently lost user saves.
- Treating the file as an explicit persistent import candidate with a new gate: the putative channel was never live in clean-audit state, and adding a gate would overlay a second policy on canonical authority.
- Deleting an existing user-root `settings.json` proactively during migration: it can still be the old-version migration input and is harmless once inert.
- Using the same `settings.json` name for exports or default templates; those are distinct roles and must remain distinguishable.

## Constraint

Canonical document creation MUST NOT depend on shadow import, feature flags, or any user-root file. A surviving file MUST NOT be read, audited, or written at runtime; its only tolerated presence is the migration source, which is consumed once and removed after backup. The 503 response is the sole canonical-unavailable outcome for settings routes. Snapshots and backup manifests MUST describe canonical state only; secrets removal MUST follow the same surface checklist rather than inventing a new mechanism.
