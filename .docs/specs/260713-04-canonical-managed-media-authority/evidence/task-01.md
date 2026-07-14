# Task 1 Evidence: Managed Media Catalog And Audit

## Result

Completed the managed-media schema, shadow catalog/import, audit scope, and
control-plane registration. Existing compatibility files remain the active
projection during this task and are never moved by shadow import or audit.

## TDD And Validation

- Red: the initial control-plane proof failed because `managed_media` had no
  registered slice or audit runner.
- Green:
  `bun run --cwd tests test:unit -- canonical-managed-media-store.test.js canonical-sqlite-migrations.test.js canonical-storage-slice-registry.test.js canonical-sqlite-operator.test.js canonical-sqlite-cli.test.js --runInBand`
  passed: 5 suites, 38 tests.
- Integrity: `git diff --check` passed.

## Covered Artifacts

- Migration 6 creates the managed blob, reference, folder/membership, and
  repair tables.
- `canonical-managed-media-shadow-import.js` catalogs backgrounds, assets,
  persona avatars, attachments, and user images while excluding placeholders
  and `assets/temp`.
- The audit persists the `managed_media` scope and classifies registered,
  duplicate-content, orphan, missing, hash-mismatch, and unsafe-path state.
- The storage control plane and audit CLI expose the independent media slice.

## PM Boundary

The exercised fixtures prove cataloging and audit classification without
moving compatibility files. Managed write projection, repair replay, deletion,
and GC are deliberately deferred to Task 3; the registered media repair
runner therefore remains absent until that task provides a real operation.
