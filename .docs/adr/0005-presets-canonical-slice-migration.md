---
description: "Presets enter canonical SQLite through one marker-driven import and stay inert files; projection mode is off, /api/settings/get keeps its shape, and seeded/exported files retain names."
kind: adr
topic: presets-canonical-slice-migration
id: "ADR-0005"
status: active
supersedes: null
created_at: 2026-11-26
affects_symbols:
  - "src/endpoints/presets-store.ts#upsertCanonicalPreset"
  - "src/endpoints/settings-store.ts#ensureCanonicalSettingsDocument"
---

# Presets Canonical Slice Migration

## Context

The settings migration showed that a persistent file candidate becomes an overwrite channel when audit state goes stale. Presets are a named-document collection without revision history or a projection era, and the client already consumes them through `/api/presets/*` and the arrays embedded in `/api/settings/get`; file names were only an implementation detail of the runtime.

## Decision

Presets use canonical SQLite as the only runtime authority and avoid a persistent candidate state entirely. File migration is a one-time init import guarded by per-file success markers: a marked file is never rescanned on restart, upgrade, or audit-stale, so no file can later overwrite canonical data. Invalid files are left in place and retried once per init. `getProjectionMode` is always `'off'` with a warn-once when the deprecated projection config is non-off; no file write-back function exists. `/api/settings/get` continues to expose `openai_settings`/`openai_setting_names` from canonical rows in the same locale-compare order and with the same canonical-unavailable 503 contract. Seeding inserts a bundled preset only when its name is absent, preserving the old "do not resurrect a deleted preset" behavior. Export materializes `OpenAI Settings/<name>.json` artifacts with historical file names for user-initiated rollback or older tools.

## Rejected

- A persistent import candidate or file audit for presets: audit-stale would turn it into an overwrite upsert channel, the exact settings risk this slice avoids.
- Implementing any sync/write projection for presets; the slice never had one and a projection repair table would be dead semantics.
- Changing `/api/settings/get` response shape, ordering, or unavailable behavior; client array-index semantics are a compatibility contract.
- Renaming exported preset files like `settings.export.json`; the preset directory name is not confused with runtime authority and historical names aid回灌.
- Re-creating a preset a user deleted when a bundled template is present.

## Constraint

Marker presence MUST permanently disable re-import for that file; a missing/altered database must not let stale files silently win. A marker is recorded only after a successful import. Canonical unavailability MUST fail closed with the existing 503 reason rather than reading files. Seed insertion MUST be name-absent only, and exported file names MUST remain compatible with the historical layout.
