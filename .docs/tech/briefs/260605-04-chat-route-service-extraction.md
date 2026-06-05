# Chat Route Service Extraction Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 3 步聚焦 `src/endpoints/chats.js`：在已交付 chat import converter 与 backup helper 后，继续抽一个 route-adjacent chat service/helper，优先选择 search/recent 或 chat metadata assembly 这类可测试边界。

## Constraints

- 不改变 JSONL serialization 与 integrity check 行为。
- 不改变 save/rename/delete/import/export response shape。
- 不移除 character-index chat-stat dirty marking。
- 不合并 group 与 character chat routes。

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 3 步的用户意图。
