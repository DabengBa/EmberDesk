# Canonical Chat Authority Cutover

## 意图与核心流程

一句话意图：在 foundation audit clean 后，将完整 character/group chat payload 切为 DB-first
read/write authority，并把 JSONL 保留为兼容 projection、import/export 和 rollback surface。

Read flag 使用 session/message rows 重建现有完整数组 payload。Write flag 下 save、rename、
delete、import 先提交 canonical transaction，再原子投影 JSONL；projection failure 写入
repair queue。Export 始终可从 canonical rows 生成兼容 JSONL。

## 范围 / 不做范围

本阶段包括：

- DB-first get/save/rename/delete/import/export。
- Character/group parity、projection repair、external JSONL drift 和 rollback gates。
- Persona/background locks、swipes、integrity 和 attachment refs 的 authority cutover。

本阶段不包括：

- 不做 search/recent index、backup/restore closure、server pagination。
- 不改变 generation、streaming、renderer、DOM、events、slash 或 message actions。

## 边界规则 / 验收

R1: DB-first get/export 必须重建与 JSONL path 等价的 header/messages payload 和顺序。

R2: Save/regenerate/retry/swipe 所产生的完整 payload 必须在一次 session transaction 内提交，
不得留下 partial swipe 或重复 order。

R3: Rename 改变 display/projection identity，不改变 stable session/message IDs。

R4: Delete/import 必须保持现有 confirmation、backup、converter、integrity 和 response shapes。

R5: Canonical commit 后 JSONL projection failure 必须记录 repair，DB 继续是 authority。

R6: External JSONL edits 只能显式 import/resolve，不能由 scan 自动覆盖 canonical rows。

R7: Flag off 保持 JSONL authority；canonical writes 后 rollback 需要 projection audit clean、
attachment refs 完整且无 open repair。

R8: 当前 `/get` 全量 payload 与前端 `showMoreMessages()` 合同保持，不引入 server pagination。

R9: Protected rendering/actions/events/slash/extension contracts 必须通过兼容测试。

## 架构 / 约束

- 依赖 canonical chat foundation clean audit。
- Route 仍由 `src/endpoints/chats.js` 拥有，store/coordinator 下沉。
- 使用独立 read/write flags；write=true 必须要求 read=true 和 clean audit。

## 数据 / 集成

复用 foundation schema，新增 projection repair 与必要 revision/concurrency 字段。

主要集成点：

- `src/endpoints/chats.js`
- canonical chat read/write service
- `src/endpoints/chat-import-service.js`
- `src/endpoints/chat-backup-helpers.js`

## 验证

```bash
bun run --cwd tests test:unit -- canonical-chat-read-service.test.js canonical-chat-write-service.test.js chat-route-service.test.js chat-import-service.test.js chat-backup-helpers.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-streaming.e2e.js chat-message-layout.e2e.js
bun run test:compat
bun run docs:check
```

## Doc ID 契约

- `page.chat_workspace`：更新 chat persistence authority、projection 和 rollback 行为。
- `feature.chat_message_rendering`：确认完整 payload 与可见 rendering 不变。
- `feature.chat_message_actions`：确认 swipe/retry/regenerate 持久化结果与 action contract 不变。

## 参考资料

- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `src/endpoints/chats.js`
- `public/script.js`
