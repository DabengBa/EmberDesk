# Canonical SQLite Chat Stats Authority

## 意图与核心流程

一句话意图：把 character chat stats 的 authority 从 derived dirty-scan 流程切到 canonical DB，同时保持 chat bodies 仍然是 JSONL files。

主要参与者或触发条件：

- Phase 4 开始
- `features.storage.canonicalSqlite.chatStats=true`
- chat save/rename/delete/import 路径需要直接更新 canonical stats

主路径顺序：

1. character chat 路由完成文件 side effect。
2. 同步更新 canonical `character_chat_stats`。
3. 读取 character list/recent summary 时优先使用 canonical stats。
4. 外部文件改动或 drift 时，可通过 rebuild 命令重算 stats。

## 范围 / 不做范围

本次要改变什么：

- 把 `markCharacterChatStatsDirty`/directory scan 的 steady-state 角色替换为 direct canonical stats updates。
- 为 save/rename/delete/import 建立 stats maintenance contract。
- 提供 stats rebuild 命令。

不做范围：

- 不把 chat message bodies 迁移进 SQLite。
- 不把 group chats 纳入 character stats authority。
- 不把 `/recent`、`/search` 全量改造成 DB-backed chat message query 系统。

第一个可交付切片：

- 只维护 character chat stats：
  - `chat_count`
  - `chat_size_bytes`
  - `date_last_chat_ms`
  - `stats_updated_at_ms`

## 边界规则 / 验收

验收项：

1. 以下 character chat 事件会直接更新 canonical stats：
   - `/save`
   - `/rename`
   - `/delete`
   - `/import`
2. group chat 路由不误更新 character stats。
3. chat bodies 仍保留 JSONL 写入、导出、导入行为。
4. rebuild 命令可以仅通过 JSONL 文件重建 stats，而不触碰 message bodies 内容。
5. 旧的 derived dirty 标记路径不再是 steady-state authority；若保留，只能作为 rollback/compat 过渡。

错误边界：

- stats 更新失败时，需要有明确 repair/rebuild 路径。
- 文件写入成功但 stats 更新失败时，不能静默假装 stats 已一致。

## 架构 / 约束

- 主要绑定点保持在 `src/endpoints/chats.js`。
- 若需要抽 helper，可在 route 邻近 service 中完成，不应把 chat route 语义拆散到难以追踪的位置。
- rebuild 命令可以走脚本或 service helper，但不得改变现有 chat 文件结构。
- `readRecentChatPayload()` / `searchChatPayload()` 仍以现有文件扫描 contract 为主，除非后续另立 spec。

## 数据 / 集成

输入：

- chat JSONL files
- chat route payload
- canonical `character_chat_stats`

输出：

- 更新后的 stats 行
- rebuild report

集成点：

- `src/endpoints/chats.js`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/character-index.js`
- 未来 `scripts/canonical-sqlite-repair.mjs`

兼容与迁移事项：

- 角色卡列表和相关 summary 读取 stats 时，切换到 canonical source。
- chat export/import 格式与现有兼容面不变。

## 验证

建议测试：

```bash
bun run --cwd tests test:unit -- chat-route-service.test.js interaction-performance-index.test.js --runInBand
```

新增单测应覆盖：

- save/rename/delete/import 更新 canonical stats
- group chats 不更新 character stats
- rebuild 能从 JSONL 重建
- stats 更新失败后的 repair 标记或错误传播

人工检查：

- character list 上的 chat stats 与文件实际情况一致
- 关闭 `chatStats` 后能回退到旧的 stats 计算路径

## Doc ID 契约

无新增 semantic Doc ID。

现有绑定点：

- `feature.character_library_panel`
- `page.chat_workspace`

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `src/endpoints/chats.js`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/character-index.js`
- `tests/chat-route-service.test.js`
- `tests/interaction-performance-index.test.js`

