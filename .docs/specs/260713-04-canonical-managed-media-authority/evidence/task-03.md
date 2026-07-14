# Task 3 Evidence: Canonical Media Writes, Repair, And GC

## Result

Implemented hash-addressed managed content under `storage/managed-media`, staged writes,
canonical reference commits, compatibility projection, replayable projection repairs,
reference-aware deletion/tombstones, and audited dry-run-by-default garbage collection. The
existing endpoint guards and compatibility paths remain the endpoint-facing contract. Background
folder create, update, delete, assign, unassign, and thumbnail changes also commit canonical
folder/membership state before atomically projecting `image-metadata.json`; a failed folder
projection records a replayable `folder_projection` repair.

## TDD And Validation

- Red: write-service tests exercised failed projection and shared-content deletion before the
  coordinator preserved the committed canonical record and deferred collection.
- Green:
  `bun run --cwd tests test:unit -- canonical-managed-media-store.test.js canonical-managed-media-read-service.test.js canonical-managed-media-write-service.test.js canonical-managed-media-route-service.test.js canonical-storage-slice-registry.test.js canonical-sqlite-operator.test.js canonical-sqlite-cli.test.js canonical-sqlite-rollout-contract.test.js thumbnail-write-time-pregeneration.test.js thumbnail-placeholder-background.test.js --runInBand`
  passed: 10 suites, 57 tests.
- Compatibility: `bun run test:compat` passed: 1 suite, 8 tests.
- Syntax and integrity checks passed for the managed-media services, endpoint integrations,
  operator/repair scripts, and `git diff --check`.

## Covered Artifacts

- `src/endpoints/canonical-managed-media-write-service.js`
- `src/endpoints/canonical-managed-media-store.js`
- `src/endpoints/backgrounds.js`, `image-metadata.js`, `assets.js`, `avatars.js`, `images.js`, and `files.js`
- `src/canonical-sqlite-operator.js`
- `scripts/canonical-sqlite-repair.mjs`
- `tests/canonical-managed-media-write-service.test.js`

## PM Boundary

Tests prove a projection failure leaves canonical authority and a repair record intact, a
shared blob survives removal of one reference, and GC is non-destructive unless explicitly
applied after a clean audit. They also prove an interrupted folder projection replays the
compatibility metadata and that canonical folder reads retain API-compatible membership payloads.
They do not replace operator review of a production filesystem or a real browser attachment
workflow.
