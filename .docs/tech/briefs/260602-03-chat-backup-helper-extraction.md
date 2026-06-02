---
created: 2026-06-02
source: "User updated the modernization roadmap to confirm the next work, then invoked $brainstorming."
confirmed: true
last_updated: 2026-06-02
---

# Brief: 260602-03 Chat Backup Helper Extraction

## User Original Request

- "docs\\tech\\modernization-roadmap.md , 更新文档内容,确定下一步工作内容."
- "$brainstorming"

Working interpretation before approval: the requested brainstorming target is the confirmed next modernization slice in `.docs/tech/modernization-roadmap.md`, namely extracting pure chat backup planning helpers from `src/endpoints/chats.js` before broader chat route/service work.

## Background & Motivation

The character-card helper slice and chat import converter helper slice are already delivered. The modernization roadmap now identifies chat backup helper extraction as the next backend slice. The current chat route keeps deterministic backup planning, filesystem writes, retention cleanup, throttled scheduling, save-route integrity checks, and chat-stat dirty marking in the same module. The user needs a shippable design that improves testability without changing backup timing, retention semantics, JSONL save behavior, or route response shapes.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Next modernization slice | Continue the roadmap with a concrete, low-risk chat route extraction | Delivered; commit pending | 2026-06-02: roadmap updated to make chat backup helper extraction the confirmed next work; 2026-06-02: user invoked `$brainstorming`; 2026-06-02: delivery extracted the backup planning helper and advanced the roadmap's next recommendation to world-info external conversion helpers | Source: `.docs/tech/modernization-roadmap.md`; code: `src/endpoints/chats.js`, `src/endpoints/chat-backup-helpers.js`; test: `tests/chat-backup-helpers.test.js`; commit pending because current project rules require care before staging untracked task files |
| Behavior preservation | Keep chat save, backup files, retention, throttle/flush, and integrity behavior unchanged | Final review passed | 2026-06-02: repo mapping identified `backupChat()`, `getBackupFunction()`, `trySaveChat()`, `/save`, and `/group/save` as protected seams; 2026-06-02: implementation kept file writes, cleanup calls, throttle map, process-exit flush, and route response behavior in `src/endpoints/chats.js` | Binding points: `src/endpoints/chats.js`, `src/endpoints/backups.js`, `src/endpoints/data-maid.js` |
| Regression proof | Add focused proof before moving backup planning logic | Passed | 2026-06-02: no existing direct test covered backup planning helpers; design required new helper tests before route refactor; 2026-06-02: red proof failed before helper creation, then focused helper tests passed after implementation | Proof: `bun run --cwd tests test:unit -- chat-backup-helpers.test.js --runInBand`; test file: `tests/chat-backup-helpers.test.js` |

## Non-Goals

- Do not change JSONL serialization or chat save/load behavior.
- Do not change integrity-check behavior or the `force` override path.
- Do not change backup timing, throttle leading/trailing behavior, or process-exit flush behavior.
- Do not change backup retention count semantics or config keys.
- Do not change `/api/chats/save`, `/api/chats/group/save`, or backup endpoint request/response shapes.
- Do not update `.docs/db/` unless implementation later changes user-visible backup behavior, which is not expected for this slice.
