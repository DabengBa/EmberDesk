# Task 01 Evidence

- Scope: lossless JSONL parsing/snapshot and stable character/group session-message identity.
- Red: `bun run --cwd tests test:unit -- canonical-chat-foundation.test.js --runInBand` initially failed because `canonical-chat-shadow-import.js` and `canonical-chat-store.js` did not exist.
- Green: the same test now verifies repeat import and file rename preserve session/message IDs, source JSONL round-trips byte-for-byte, unknown header/message fields remain present, and group JSONL receives the same contract.
- Artifact paths: `src/canonical-chat-shadow-import.js`, `src/endpoints/canonical-chat-store.js`, `tests/canonical-chat-foundation.test.js`.
