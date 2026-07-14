# Task 01 Evidence

## Scope

Implemented canonical full-payload reconstruction for character and group chats, then
used it for canonical-gated `/get`, `/group/get`, and JSONL/text export paths. The
existing JSONL read path remains the fallback while canonical reads are disabled or
blocked.

## Red-Green

- Red: `bun run --cwd tests test:unit -- canonical-chat-read-service.test.js --runInBand`
  failed because `canonical-chat-read-service.js` did not exist.
- Red: `bun run --cwd tests test:unit -- canonical-chat-route-authority.test.js --runInBand`
  returned externally edited JSONL from `/get`.
- Green: `bun run --cwd tests test:unit -- canonical-chat-read-service.test.js canonical-chat-route-authority.test.js --runInBand`
  passed 4 tests. The route test imports and audits a chat, modifies its JSONL
  projection out of band, and verifies `/get` still returns the full canonical
  header/messages/swipes payload.

## Compatibility

- `bun run test:compat` passed 8 extension compatibility tests.

## Artifact Paths

- `src/endpoints/canonical-chat-read-service.js`
- `src/endpoints/chats.js`
- `src/canonical-storage-slice-registry.js`
- `tests/canonical-chat-read-service.test.js`
- `tests/canonical-chat-route-authority.test.js`
