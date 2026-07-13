# Task 03 Evidence

## Summary

Canonical `/api/settings/save` commits revision-controlled settings documents first, projects `settings.json` after DB success, returns 409 on stale revision, and records `settings_projection_repairs` when projection fails without rolling back the DB revision.

## Red → Green

- Red: conflict/projection tests failed before write path and repair recording.
- Green: dual-session conflict and projection-failure cases pass.

## Proof

```bash
bun run --cwd tests test:unit -- canonical-settings-store.test.js canonical-sqlite-operator.test.js settings-react-route.test.js --runInBand --forceExit
```

## PM

Two saves with the same base revision: first succeeds (revision N+1 + file projection); second gets 409 with current revision. Simulated projection EISDIR keeps DB revision and opens a repair blocker.

## Artifacts

- `src/endpoints/settings.js` (write path, projection, conflict)
- `src/endpoints/settings-store.js` (`upsertCanonicalSettingsDocument`, repairs)
