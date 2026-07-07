# Canonical SQLite Migration Runner

## 意图与核心流程

一句话意图：为 canonical DB 提供可审计、幂等、按版本有序执行的 migration system，作为所有 schema 变更的唯一入口。

主要参与者或触发条件：

- canonical DB 首次创建
- 应用升级到包含新 schema 版本的版本
- shadow import/read/write/repair 逻辑需要已知 schema

主路径顺序：

1. canonical store manager 打开 DB。
2. migration runner 检查 `schema_migrations` 与当前目标版本。
3. 按顺序执行缺失 migration。
4. 成功后记录版本与时间戳。
5. 任何失败都阻断后续 canonical read/write cutover。

## 范围 / 不做范围

本次要改变什么：

- 新增 migration runner 模块，候选路径为 `src/canonical-sqlite-migrations.js`。
- 固定 `schema_migrations` 表和 migration 文件/列表格式。
- 为 `characters`、`character_chat_stats` 和 projection/repair 所需元数据表提供初始 migration。

不做范围：

- 不在本 spec 中实现 shadow import、audit、read cutover、write projection。
- 不引入自动推导 schema 的 ORM-first 流程。
- 不支持降级 migration 自动回滚；rollback 通过 feature flag 和 repair/audit 合同处理。

第一个可交付切片：

- 只支持前向、幂等、按序应用的 SQL migrations。

## 边界规则 / 验收

验收项：

1. 存在 `schema_migrations` 表，至少记录 `version`、`name`、`applied_at_ms`。
2. 首次运行能创建 Phase 1 所需最小 schema：
   - `characters`
   - `character_chat_stats`
   - 若 Phase 3/7 需要，可包含 `projection_repairs` 或等价 repair metadata 表
3. 重复运行 migration 不会重复创建对象，不会破坏已有数据。
4. migration failure 会阻断 `reads`/`writes`/`chatStats` flag 生效，并暴露明确原因。
5. migration runner 不会因为某个 migration 失败而自动删除 DB 或回写文件。

失败边界：

- 部分 migration 失败后，DB 仍保留现场；不自动 reset。
- 严格模式下失败应导致测试失败；非严格模式下 canonical mode disabled，但 file-backed 行为保持。

## 架构 / 约束

- migration 必须来源清晰、顺序稳定、可测试。
- migration 代码可用 hand-written SQL；Phase 1 不默认引入 ORM。
- 如果后续单独批准 ORM gate，也只能在不破坏现有 migration 审计能力的前提下替换实现细节，不能改变本 spec 的外部合同。
- schema 设计必须为 Phase 2-4 留出最小必要字段，但不得提前做 full World Info 或 chat body normalization。

推荐初始 schema 范围：

- `characters`
  - `id`
  - `avatar_filename`
  - `internal_name`
  - `display_name`
  - `card_json`
  - `shallow_json`
  - `world_name`
  - `created_at_ms`
  - `updated_at_ms`
  - `deleted_at_ms`
- `character_chat_stats`
  - `character_id`
  - `chat_count`
  - `chat_size_bytes`
  - `date_last_chat_ms`
  - `stats_updated_at_ms`

## 数据 / 集成

输入：

- 打开的 canonical DB
- 当前 migration 清单
- feature flags / strict mode

输出：

- 已迁移的 canonical DB
- migration status / error reason

集成点：

- `src/canonical-sqlite.js`
- 未来 `scripts/canonical-sqlite-audit.mjs`
- 未来 `scripts/canonical-sqlite-repair.mjs`
- 未来 `src/endpoints/character-store.js`

兼容与迁移事项：

- migration runner 只负责 DB schema，不触碰 PNG/JSONL/World Info 文件。
- 任何需要从文件导入的数据都由 shadow import 负责，不应塞进 migration 本身。

## 验证

建议测试：

```bash
bun run --cwd tests test:unit -- user-directories.test.js --runInBand
```

新增单测应覆盖：

- 空库首次迁移成功
- 迁移幂等
- 中途失败时记录清晰错误且不删除 DB
- target version 与 applied version 对比逻辑
- strict / non-strict 行为差异

完成证据：

- 迁移测试可独立运行，不依赖 route 层
- 新 schema 被 shadow import/read/write spec 引用时不再有歧义

## Doc ID 契约

无新增 semantic Doc ID。

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/briefs/260707-01-canonical-sqlite-character-metadata-chat-stats.md`
- `src/user-directories.js`
- `src/command-line.js`
- `src/derived-cache-sqlite.js`
- `tests/user-directories.test.js`
- `tests/derived-cache-sqlite.test.js`
- `Inference: initial schema fields are derived from current `/api/characters/*` payload needs, `character-index.js` cached columns, and roadmap Phase 1-4 scope.`

