# Canonical Chat Message Bodies Authority 迁移

## 意图与核心流程

一句话意图：在所有 structured user-data slices 稳定后，把 chat message bodies 从 JSONL 文件迁移到 canonical SQLite，并保留 chat export、import、backup、rendering 和 extension-visible message contracts。

主要参与者或触发条件：

- extension storage canonical migration 已完成
- 维护者准备执行 roadmap 最后一阶段
- chat stats authority 已交付，但 message bodies 仍是 JSONL authority

主路径顺序：

1. 盘点 `src/endpoints/chats.js`、`src/endpoints/chat-route-service.js`、`src/endpoints/chat-import-service.js`、`src/endpoints/chat-backup-helpers.js` 和 message rendering contracts。
2. 设计 chat sessions、messages、swipes、metadata、attachments/file refs 的 canonical schema。
3. Shadow import existing JSONL chats，生成 audit report，不改变 runtime behavior。
4. DB-first reads behind flag，保持 current chat loading/rendering payload。
5. DB-first writes with JSONL projection/export compatibility。
6. 增加 repair/rebuild/rollback tools，覆盖 large-chat performance 和 external JSONL drift。
7. 更新 docs 和 semantic surfaces，确认 message row DOM、actions、extensions 兼容。

## 范围 / 不做范围

本次要改变什么：

- Chat message bodies canonical authority 迁移到 SQLite。
- JSONL 变成 export/projection/rollback/import surface。
- Chat import/export/backup 与 rendering path 读取 canonical data。

明确推迟什么：

- 不改变 provider generation lifecycle。
- 不重写 React main-chat rendering owner。
- 不删除 message-row DOM compatibility selectors。
- 不迁移尚未在前序 structured slices 中完成的 storage domain。

第一个可交付切片：

- Shadow import/audit + DB-first read parity；writes/projection 作为后续 plan tasks，但本 spec 要定义完整目标。

## 边界规则 / 验收

验收项：

1. Existing chats 从 DB-first reads 加载后，用户看到的 message order、role、name、avatar、reasoning、media/file shell、swipes 和 metadata 与 JSONL path 一致。
2. Chat save/regenerate/retry/swipe/rename/delete/import/export 行为不变。
3. JSONL export 保留，并能从 canonical DB 生成兼容结果。
4. Projection failure 记录 repair intent，不把 JSONL 文件重新当作 authority。
5. Large-chat workloads 有性能 proof，不能因 DB schema 或 transaction 粒度明显退化。
6. Extension-visible message row DOM 和 public chat/slash/event surfaces 不被破坏。
7. External JSONL edits 不再自动成为 truth，必须通过 import/rescan/repair path。

失败边界：

- 如果 DB-first read 无法保持 message rendering parity，不能启用 writes。
- 如果 chat import converter 不能无损表达为 canonical schema，必须修 converter/audit，不得丢字段。
- 如果 export 无法生成兼容 JSONL，不能删除 JSONL projection。

## 架构 / 约束

- Chat message bodies 不是 chat-stats authority 的小扩展；必须独立 schema、audit、projection、repair 和 performance proof。
- `public/scripts/chat-message-render-descriptor.js`、message row DOM 和 third-party compatibility docs 是硬边界。
- Provider generation lifecycle、streaming、quiet/background helper requests 不因 storage migration 被重写。
- DB transaction 需要按 session/message batch 控制，避免 large chat save/load 阻塞。

## 数据 / 集成

建议 schema 方向：

- `chat_sessions(id, owner_type, owner_id, title, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms)`
- `chat_messages(id, session_id, message_index, role, name, avatar, payload_json, created_at_ms, updated_at_ms, deleted_at_ms)`
- `chat_message_swipes(id, message_id, swipe_index, payload_json, created_at_ms)`
- `chat_projection_repairs(...)`
- `canonical_audit_state` slice key 增加 `chat_messages`

集成点：

- `src/endpoints/chats.js`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-import-service.js`
- `src/endpoints/chat-import-converters.js`
- `src/endpoints/chat-backup-helpers.js`
- `public/scripts/chats.js`
- `public/scripts/chat-message-render-descriptor.js`

## 验证

执行：

```bash
bun run --cwd tests test:unit -- chat-route-service.test.js chat-import-service.test.js chat-import-converters.test.js chat-backup-helpers.test.js chat-message-render-descriptor.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-streaming.e2e.js
bun run test:compat
bun run docs:check
```

新增 focused proof：

- JSONL shadow import idempotency
- DB-first read parity for normal messages, swipes, reasoning, media/file wrappers
- DB-first write and JSONL projection
- import/export compatibility
- repair after external JSONL drift
- large-chat load/save benchmark

## Doc ID 契约

- `page.chat_workspace`：chat workspace user-visible owner。
- `feature.chat_message_rendering`：message body rendering。
- `feature.chat_message_actions`：message actions/swipes/retry controls。
- `feature.chat_generation_auto_recovery`：generation failure/retry visibility。
- 如新增 operator-facing term，可新增 `term.canonical_chat_message_store`。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `src/endpoints/chats.js`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-import-service.js`
- `tests/chat-route-service.test.js`
- `tests/chat-message-rendering.e2e.js`
