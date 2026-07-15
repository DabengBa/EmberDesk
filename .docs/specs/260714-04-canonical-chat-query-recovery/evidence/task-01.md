# Task 1 Evidence

- Red: `bun run --cwd tests test:unit -- canonical-chat-query.test.js --runInBand`
  failed because `src/endpoints/canonical-chat-query-service.js` did not exist.
- Green: `bun run --cwd tests test:unit -- canonical-chat-query.test.js chat-route-service.test.js --runInBand`
  passed 8 tests covering canonical character/group search parity, hybrid recent parity
  with root-chat fallback, fragment/file-name matching, corrupt group JSON skips, pinned
  ordering, and metadata preservation.
- Additional route check: `bun run --cwd tests test:unit -- canonical-chat-query.test.js chat-route-service.test.js canonical-chat-route-authority.test.js --runInBand`
  passed 12 tests, confirming the new `/search` and `/recent` branch did not regress the
  existing canonical `/get` and `/save` authority behavior.
- Summary: added a canonical query service for character/group search and recent payloads,
  switched `/api/chats/search` and `/api/chats/recent` to use canonical reads after the
  existing clean-audit gate opens, and kept top-level root-chat recent entries on the
  compatibility-file path so the route contract remains unchanged.
- Artifact paths:
  - `src/endpoints/canonical-chat-query-service.js`
  - `src/endpoints/chats.js`
  - `tests/canonical-chat-query.test.js`
