# Chat Route Service Extraction Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立临时交付设计文件；wrap-up 后持久入口改为本 brief、roadmap 和 project history。

## Intent

第 3 步聚焦 `src/endpoints/chats.js`：在已交付 chat import converter 与 backup helper 后，继续抽一个 route-adjacent chat service/helper，优先选择 search/recent 或 chat metadata assembly 这类可测试边界。

## Constraints

- 不改变 JSONL serialization 与 integrity check 行为。
- 不改变 save/rename/delete/import/export response shape。
- 不移除 character-index chat-stat dirty marking。
- 不合并 group 与 character chat routes。

## Delivery Trace

- Status: Delivered on 2026-06-05.
- Code path: `src/endpoints/chat-route-service.js` owns deterministic `/api/chats/search` and `/api/chats/recent` assembly.
- Route boundary: `src/endpoints/chats.js` keeps Express request/response handling, JSONL parsing through `getChatInfo()`, save/rename/delete/import/export response shapes, backup lifecycle, and character-index chat-stat dirty marking.
- Proof: `tests/chat-route-service.test.js` covers character chats, group chats, root chats, pinned sorting, metadata propagation, missing files, and corrupt group JSON. Baseline proof also kept `chat-import-converters.test.js`, `chat-backup-helpers.test.js`, and root lint green.

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 3 步的用户意图。
- 2026-06-05: 交付 search/recent route-adjacent service，并记录代码路径、边界和验证证据。
