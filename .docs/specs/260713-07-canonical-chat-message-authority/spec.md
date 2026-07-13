# Canonical Chat Message Authority

## 意图与核心流程

一句话意图：让 canonical SQLite 成为 character/group chat sessions、messages、swipes、chat metadata 与 attachment references 的权威源，并把 JSONL 降为 import/export/projection/rollback surface。

迁移按 chat file 解析、规范化并保留未知 message fields，建立 session/message identity 与顺序；audit-clean 后先切 read/search/recent，再切 save/rename/delete/import；generation 与 renderer 继续使用现有内存 payload，只把持久化边界替换为 chat store；JSONL export/projection 从 canonical rows 生成。

## 范围 / 不做范围

本阶段包括：

- Character/group sessions、message order、完整 message payload、swipes、`chat_metadata`、integrity 与 managed attachment refs。
- JSONL shadow import/audit、DB-first get/search/recent、save/rename/delete/import/export。
- Backup/restore、projection repair、external JSONL drift、large-chat pagination/performance。
- Persona/background chat locks 随 `chat_metadata` 迁移。

本阶段不包括：

- 不重写 provider generation、streaming、retry/fallback 或 visible renderer ownership。
- 不删除 JSONL import/export；是否保留持续 projection 由 rollout 证据决定。
- 不把 media bytes 存入 message rows，只引用 managed media IDs。
- 不改变 message-row DOM、slash/event 或 extension public contracts。

## 边界规则 / 验收

R1: JSONL shadow import 必须幂等并保留 session header、message order、role/name/avatar、reasoning、media/file wrappers、swipes、timestamps、extra fields、integrity 与 `chat_metadata`。

R2: Character 与 group chat 必须使用稳定 session/message IDs；rename 改 display/file projection，不重建 message identity。

R3: DB-first get/search/recent/export 的 payload、排序、匹配与可见渲染必须和当前 JSONL path 等价，并支持有界分页而非每次加载所有 message bodies。

R4: save/regenerate/retry/swipe/rename/delete/import 在 write flag 下以数据库事务为 authority；失败不得留下重复 message index、部分 swipe 或失效 attachment refs。

R5: JSONL projection/export failure 必须记录 repair；external JSONL edits 只能通过显式 import/resolve 进入 canonical state，不能被目录扫描自动接管。

R6: backup/restore 必须覆盖数据库 revision 与 managed attachment manifest；restore 产生可审计的新状态，且 retention/integrity failure 有明确恢复路径。

R7: large-chat proof 必须覆盖分页、search、recent、save transaction 与 concurrent read，性能不得以同步全库重写换取 authority。

R8: Provider lifecycle、React/legacy message rendering、message actions、DOM selectors、events/slash 和 third-party compatibility 保持。

R9: flag off 时 JSONL authority 可用；canonical writes 后 rollback 需要全量 compatible export audit clean、attachment refs 完整且无 open repair。

## 架构 / 约束

- 依赖 personas 与 managed media stable IDs；World Info 已有稳定 canonical IDs。
- Route 继续由 `src/endpoints/chats.js` 拥有，存储协调下沉到独立 chat store/service。
- 保存可按 session transaction 替换 payload，但不得全库锁定；读取使用 session/order indexes。
- 未知 JSON fields 保存在可往返 payload 中，不能因 schema 规范化丢失扩展数据。
- 现有 `write-file-atomic`、backup、integrity、import converter 语义作为 parity 基线。

## 数据 / 集成

建议 schema：

- `chat_sessions(id, owner_type, owner_id, display_name, metadata_json, integrity, revision, ...)`
- `chat_messages(id, session_id, message_index, role, name, payload_json, created_at_ms, ...)`
- `chat_message_swipes(message_id, swipe_index, payload_json)`
- `chat_attachment_refs(message_id, blob_id, role)`
- `chat_projection_repairs(...)`

主要集成点：

- `src/endpoints/chats.js`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-import-service.js`
- `src/endpoints/chat-import-converters.js`
- `src/endpoints/chat-backup-helpers.js`
- `public/scripts/chats.js`
- message rendering/action compatibility owners

## 验证

```bash
bun run --cwd tests test:unit -- canonical-chat-store.test.js chat-route-service.test.js chat-import-service.test.js chat-import-converters.test.js chat-backup-helpers.test.js chat-message-render-descriptor.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-streaming.e2e.js chat-message-layout.e2e.js
bun run test:compat
bun run docs:check
```

另需固定 large-chat fixture 的 load/search/save 指标与 Node 26.3.0 release proof，不能只以单元测试替代。

## Doc ID 契约

- `page.chat_workspace`：更新 chat persistence、search/recent、backup/restore 与 attachment authority。
- `feature.chat_message_rendering`：确认存储切换后 message payload 与可见渲染保持。
- `feature.chat_message_actions`：确认 swipe/retry/regenerate 等动作仍使用同一持久化事务边界。

## 参考资料

- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `src/endpoints/chats.js`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-import-service.js`
- `src/endpoints/chat-backup-helpers.js`
