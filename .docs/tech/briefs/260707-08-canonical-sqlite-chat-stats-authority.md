# Canonical SQLite Chat Stats Authority Brief

## User Intent

Deliver Phase 4 of the ADR-0011 canonical SQLite storage roadmap by moving character chat stats authority from the derived dirty-scan path to canonical SQLite while keeping chat message bodies as JSONL files.

## Scope

- Character chat save, rename, delete, and import update canonical `character_chat_stats` when `features.storage.canonicalSqlite.chatStats=true`.
- Character list and get payloads continue to read `chat_size` and `date_last_chat` from canonical SQLite only when the chat stats flag is enabled.
- `scripts/canonical-sqlite-repair.mjs rebuild-chat-stats` remains the operator repair path for external JSONL file changes or drift.

## Non-Goals

- Chat message bodies are not migrated into SQLite.
- Group chats are not part of character chat stats authority.
- `/recent` and `/search` stay on the existing file-scanning contract.

## Delivery Traceability

- Status: delivered on 2026-07-07.
- Code: `src/endpoints/chats.js`, `src/endpoints/character-file-snapshot.js`, `src/endpoints/character-read-service.js`, `src/canonical-sqlite-operator.js`, `scripts/canonical-sqlite-repair.mjs`.
- Tests: `tests/interaction-performance-index.test.js`, `tests/chat-route-service.test.js`, `tests/canonical-sqlite-operator.test.js`, `tests/canonical-sqlite-cli.test.js`, `tests/character-read-service.test.js`.
- Docs: `.docs/tech/canonical-sqlite-storage-roadmap.md`, `.docs/project-overview.md`, `.docs/PROJECT_HISTORY.md`.
