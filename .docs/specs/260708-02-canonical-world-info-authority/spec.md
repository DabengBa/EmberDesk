# Canonical World Info Authority 迁移

## 意图与核心流程

一句话意图：在 legacy-mode accelerator 退休后，把 full World Info entries 迁移到 canonical SQLite，并保持现有 World Info 面板、prompt activation、regex placement、import/export 和 delete cascade 兼容行为。

主要参与者或触发条件：

- legacy-mode accelerator retirement 已完成
- 维护者准备执行 canonical SQLite roadmap 的第二阶段
- 用户需要 World Info 不再由 loose JSON files 作为唯一 authority

主路径顺序：

1. 盘点 `src/endpoints/worldinfo.js`、`public/scripts/world-info.js` 和 World Info semantic docs 的当前行为。
2. 扩展 canonical SQLite schema，新增 world books、entries、entry settings、metadata 和 projection/audit 状态。
3. 添加 shadow import + audit：从现有 World Info JSON files 导入 canonical DB，但不改变运行时行为。
4. 在 feature flag 下启用 DB-first World Info reads，再启用 DB-first writes with JSON projection。
5. 保持 import/export、converter、regex placement、prompt activation 和 delete cascade 行为。
6. 增加 repair/rebuild 工具，处理 DB/file projection drift。

## 范围 / 不做范围

本次要改变什么：

- World Info book 和 entry 的 canonical authority 切换到 per-user SQLite。
- World Info JSON files 变成 projection/import/export/rollback surface。
- World Info read/write endpoint、browser facade 和 delete cascade 通过同一个 canonical contract 协调。

明确推迟什么：

- 不迁移 chat message bodies。
- 不迁移 extension storage。
- 不删除 `public/scripts/world-info.js` facade；它仍是浏览器兼容 owner。
- 不改变用户可见 World Info 编辑流程、regex placement 值或 import/export 格式。

第一个可交付切片：

- 先实现 World Info shadow import/audit 和 DB-first reads；writes/projection 在同一 spec 中规划，但 implementation 可在 plan.md 拆成独立任务。

## 边界规则 / 验收

验收项：

1. World Info selector、editor selector、entry cards、content editor、import/export 仍符合 `feature.world_info_panel`。
2. DB-first reads 开启时，选中 world、entry 列表、entry content 与 file-backed 行为一致。
3. DB-first writes 成功后，canonical DB 是 authority，JSON projection 成功写出兼容文件。
4. Projection failure 必须记录 repair intent，不能把 JSON file 重新当作 truth。
5. Delete world book 和 character delete cascade 仍保留现有确认、预检和清理语义。
6. `regex_placement`、World Info prompt activation 和 token budgeting 输入不改变。
7. Flag off、migration blocked、audit drift、projection failure 都有明确 fallback 或 fail-closed 行为。

失败边界：

- 任何会破坏 `public/scripts/world-info.js` public/facade 行为的变更都不能合入。
- 如果 import/export converter 与 canonical schema 表达不一致，必须先修 converter parity，不得绕过 converter。

## 架构 / 约束

- 复用 canonical manager、migration runner、rollout contract 和 operator tooling 模式。
- 新 World Info schema 不得放入 `_cache`。
- `public/scripts/world-info.js` 继续 owns prompt activation、regex placement、converter/import outcome、delete cascade browser semantics。
- `public/scripts/world-info-shell-context.js` 仍只是 shell context，不变成 storage owner。
- 如果新增 feature flags，应挂在 `features.storage.canonicalSqlite.worldInfo.*` 或等价 storage flag 命名下，并由 rollout contract 校验顺序。

## 数据 / 集成

建议 schema 方向：

- `world_books(id, name, metadata_json, created_at_ms, updated_at_ms, deleted_at_ms)`
- `world_book_entries(id, world_book_id, uid, key_json, keysecondary_json, content, comment, order_value, enabled, selective, constant, position, role, probability, depth, extensions_json, updated_at_ms, deleted_at_ms)`
- `world_info_projection_repairs(...)`
- `canonical_audit_state` 扩展 slice key，区分 `world_info`

集成点：

- `src/endpoints/worldinfo.js`
- `public/scripts/world-info.js`
- `public/scripts/world-info-converters.js`
- `public/scripts/world-info-import-results.js`
- `src/endpoints/characters.js` / delete cascade preflight

向后兼容：

- 现有 World Info JSON import/export 格式保留。
- Embedded character book import 保留。
- JS-Slash-Runner 和 `@sillytavern/scripts/world-info` import surface 保留。

## 验证

执行：

```bash
bun run --cwd tests test:unit -- world-info-converters.test.js world-info-import-results.test.js worldinfo-delete-cascade.test.js world-info-shell-context.test.js --runInBand
bun run test:compat
bun run docs:check
```

新增 focused proof：

- World Info migration idempotency
- DB/file audit drift report
- DB-first read parity
- DB-first write + projection success
- projection failure repair queue
- delete cascade parity

手动检查：

- 在 workspace 打开 World Info，切换 global selector 和 editor selector，导入/导出/删除 world book，确认用户可见状态不变。

## Doc ID 契约

- `feature.world_info_panel`：World Info 面板能力 owner。
- `feature.world_book_delete`：world book 删除语义。
- `feature.character_delete`：character delete cascade。
- `page.chat_workspace`：入口与 drawer 行为。
- 如新增 operator-facing term，可新增 `term.canonical_world_info_store`，否则不新增 Doc ID。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/db/features/world-info-panel.md`
- `.docs/tech/world-info-shell-context.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `src/endpoints/worldinfo.js`
- `public/scripts/world-info.js`
- `public/scripts/world-info-converters.js`
- `tests/worldinfo-delete-cascade.test.js`
- `tests/world-info-converters.test.js`
