# Canonical SQLite Shadow Import And Audit

## 意图与核心流程

一句话意图：在不改变当前运行时 authority 的前提下，把现有 character cards 和 chat stats 导入 canonical DB，并产出 drift audit 结果。

主要参与者或触发条件：

- Phase 1 启动
- canonical DB schema 已就绪
- `features.storage.canonicalSqlite.shadowImport=true`

主路径顺序：

1. 从文件系统读取现有 PNG character cards 和对应 chat 目录。
2. 生成 canonical `characters` 与 `character_chat_stats` 行。
3. 重复导入时按幂等规则 upsert，不改变 authority。
4. 生成 audit 结果，对比 DB 与 file projection 是否一致。
5. 报告 drift，但默认不自动修复。

## 范围 / 不做范围

本次要改变什么：

- 提供 shadow import 流程。
- 提供只读 audit 报告。
- 为后续 DB-first reads 提供切换前证明。

不做范围：

- 不切换 `/api/characters/*` 到 DB-first。
- 不把 DB 结果投影回 PNG 或 JSONL。
- 不自动修复 drift。
- 不导入 chat message bodies。
- 不导入 full World Info entries。

第一个可交付切片：

- 只导入第一阶段目标数据：
  - character metadata
  - character card JSON
  - shallow list payload
  - character world binding metadata
  - chat stats

## 边界规则 / 验收

验收项：

1. 当 `shadowImport=false` 时，系统行为与当前 file-backed runtime 完全一致。
2. 导入是幂等的；重复运行不会创建重复 character 或 stats 记录。
3. 导入失败不会删除或重写 PNG、chat JSONL、World Info 文件。
4. audit 能区分至少以下状态：
   - DB 缺失某个 file-backed character
   - DB 中 payload 与文件投影不一致
   - stats 与 chat directory 扫描结果不一致
   - world binding metadata 不一致
5. audit 默认只报告，不自动 repair。
6. audit 结果足够支持 Phase 2 read cutover 决策。

错误行为：

- 单个 character 导入失败应被记录为局部错误，不应导致自动清空 DB。
- audit 发现 drift 时，应阻断 `reads`/`writes` 在生产切换，除非测试夹具显式覆盖。

## 架构 / 约束

- 导入逻辑必须复用现有 character/chat 读取逻辑或其纯 helper，避免新造 payload 语义。
- audit 输出必须 machine-readable，方便后续 repair tooling 与 CI/test fixtures 使用。
- 不依赖 derived index 作为 authority；最多把它当成对照信号，不能把其结果写回 canonical truth。
- World Info 只处理 `world_name` 绑定，不处理 full entry canonicalization。

建议模块：

- `src/endpoints/character-store-migrations.js` 或等价 importer helper
- `scripts/canonical-sqlite-audit.mjs`

## 数据 / 集成

输入：

- `request.user.directories.characters`
- `request.user.directories.chats`
- `request.user.directories.worlds`
- canonical DB

输出：

- `characters` 表 upsert
- `character_chat_stats` 表 upsert
- audit report JSON / Markdown / stderr summary

建议 audit 字段：

- `handle`
- `avatar_filename`
- `character_id`
- `status`
- `drift_types[]`
- `details`
- `audited_at_ms`

兼容与迁移事项：

- file-backed data 仍是此阶段 authority。
- out-of-band 文件改动在此阶段仍可通过重新 shadow import 进入 DB，但不代表之后 cutover 后继续保留该语义。

## 验证

建议测试：

```bash
bun run --cwd tests test:unit -- character-read-service.test.js character-write-service.test.js chat-route-service.test.js --runInBand
bun run --cwd tests test:unit -- interaction-performance-index.test.js --runInBand
```

新增单测应覆盖：

- 初次导入成功
- 重复导入幂等
- 缺失/损坏 DB 时不改写文件
- audit 正确报告 payload drift
- audit 正确报告 chat stats drift
- audit 正确报告 world binding drift

人工检查：

- 在导入后保持所有现有 API 响应不变
- 关闭所有 canonical flag 时，不应有运行时行为差异

## Doc ID 契约

无新增 semantic Doc ID。

该 spec 服务于既有用户可见 surface 的后台切换准备：

- `feature.character_library_panel`
- `page.chat_workspace`

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/interaction-performance-indexing.md`
- `src/endpoints/character-read-service.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/chats.js`
- `src/endpoints/character-index.js`
- `tests/character-read-service.test.js`
- `tests/character-write-service.test.js`
- `tests/chat-route-service.test.js`
- `tests/interaction-performance-index.test.js`

