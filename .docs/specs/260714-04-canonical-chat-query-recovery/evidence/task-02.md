# Task 2 Evidence

- Red: `bun run --cwd tests test:unit -- canonical-chat-backup-restore.test.js canonical-chat-write-service.test.js canonical-sqlite-migrations.test.js --runInBand`
  failed because `src/endpoints/canonical-chat-backup-restore-service.js` did not
  exist, write-time attachment paths were still accepted until projection, and the
  migration proof still expected the pre-repair schema tail.
- Green: `bun run --cwd tests test:unit -- canonical-chat-backup-restore.test.js canonical-sqlite-operator.test.js canonical-managed-media-store.test.js --runInBand`
  passed 21 tests covering validated canonical chat backup creation, non-destructive
  restore with a persisted restore journal, restore blocking when attachment manifests no
  longer resolve, existing chat projection repair replay, operator status aggregation, and
  managed-media manifest/audit behavior.
- Additional focused checks:
  - `bun run --cwd tests test:unit -- canonical-chat-backup-restore.test.js canonical-chat-write-service.test.js canonical-sqlite-migrations.test.js --runInBand`
    passed 16 tests and confirmed write-time blocking for unregistered managed attachment
    paths plus schema coverage for `chat_projection_repairs` and `chat_restore_operations`.
- Summary: added a canonical chat backup/restore service that snapshots session JSONL,
  projection state, and attachment-manifest bindings; restore now validates attachments
  before replacing canonical rows, records durable restore status in the DB, and leaves the
  current authority untouched when validation fails. Canonical chat writes now reject
  unregistered managed attachment paths before any authority commit.
- Artifact paths:
  - `src/endpoints/canonical-chat-backup-restore-service.js`
  - `src/endpoints/canonical-chat-write-service.js`
  - `src/canonical-sqlite-migrations.js`
  - `tests/canonical-chat-backup-restore.test.js`
  - `tests/canonical-chat-write-service.test.js`
  - `tests/canonical-sqlite-migrations.test.js`
