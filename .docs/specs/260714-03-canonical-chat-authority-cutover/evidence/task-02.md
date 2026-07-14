# Task 02 Evidence

## Scope

Implemented canonical-first chat save, rename, delete, and explicit import projection
flows for character and group chats. A committed canonical mutation now records
`chat_projection_repairs` when its JSONL compatibility projection fails; it does not
restore file authority. Operator and CLI replay write the projection from canonical
rows, then resolve the repair.

## Red-Green

- Red: `bun run --cwd tests test:unit -- canonical-chat-write-service.test.js --runInBand`
  failed because the write service did not exist.
- Green: the same test passed after the canonical-first write service and repair table
  were added.
- Red: the rename/delete repair regression initially exposed a real foreign-key failure:
  a delete repair referenced a session that had already been deleted.
- Green: the delete repair now retains its projection path without a deleted session
  foreign key; `canonical-chat-write-service.test.js` and
  `canonical-chat-foundation.test.js` passed 8 tests.
- Red: `runCanonicalSliceRepair({ sliceKey: 'chats' })` failed with
  `No repair runner registered for slice: chats`.
- Green: `canonical-sqlite-operator.test.js` now replays a failed chat projection and
  resolves the repair; the matching registry/operator tests passed 26 tests.

## Verification

- `bun run --cwd tests test:unit -- canonical-chat-read-service.test.js canonical-chat-write-service.test.js canonical-chat-route-authority.test.js canonical-chat-foundation.test.js chat-import-service.test.js chat-backup-helpers.test.js --runInBand`
  passed 24 tests.
- `bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-operator.test.js --runInBand`
  passed 26 tests.
- `bun run --cwd tests test:unit -- canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js --runInBand`
  passed 22 tests.

## Artifact Paths

- `src/endpoints/chats.js`
- `src/endpoints/canonical-chat-store.js`
- `src/endpoints/canonical-chat-write-service.js`
- `src/canonical-sqlite-migrations.js`
- `src/canonical-storage-slice-registry.js`
- `src/canonical-sqlite-operator.js`
- `scripts/canonical-sqlite-repair.mjs`
- `tests/canonical-chat-write-service.test.js`
- `tests/canonical-chat-route-authority.test.js`
- `tests/canonical-sqlite-operator.test.js`
