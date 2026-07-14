# Task 02 Evidence

- Scope: migration-seven chat schema, shadow importer, and managed attachment references.
- Command: `bun run --cwd tests test:unit -- canonical-chat-foundation.test.js canonical-sqlite-migrations.test.js canonical-managed-media-store.test.js --runInBand`
- Result: pass. The test suite proves chat session/message/swipe/attachment-ref tables migrate idempotently, attachment rows retain managed blob IDs plus compatibility metadata only, and no JSONL or media bytes are rewritten.
- Artifact paths: `src/canonical-sqlite-migrations.js`, `src/endpoints/canonical-chat-store.js`, `src/canonical-chat-shadow-import.js`.
