# Canonical SQLite DB-First Writes And Compatibility Projection

## 意图与核心流程

一句话意图：把 character mutation 的 authority 切到 canonical DB，并把 PNG/chat-directory 等兼容文件降为 projection surfaces。

主要参与者或触发条件：

- Phase 3 开始
- `features.storage.canonicalSqlite.enabled=true`
- `features.storage.canonicalSqlite.writes=true`
- DB-first reads 已证明稳定

主路径顺序：

1. 请求进入 character mutation route。
2. 现有校验、权限、文件名安全检查先执行。
3. canonical DB 在事务内完成 authority 更新。
4. DB commit 后投影兼容文件和必要的目录 side effects。
5. 若 projection 失败，返回显式错误并记录 repair intent。

## 范围 / 不做范围

本次要改变什么：

- 为以下 mutation 建立 DB-first write contract：
  - `/create`
  - `/rename`
  - `/edit`
  - `/edit-avatar`
  - `/edit-attribute`
  - `/merge-attributes`
  - `/delete`
  - `/duplicate`
  - `/import`

不做范围：

- 不迁移 chat message bodies。
- 不迁移 full World Info entries。
- 不改变 import/export 文件格式。
- 不把 group chat/group authoring 写路径纳入这一 spec。

第一个可交付切片：

- 先统一 character mutation authority 和 projection contract，再单独由 repair spec 接管失败恢复。

## 边界规则 / 验收

验收项：

1. `writes=true` 时，DB commit 是 authority boundary。
2. 以下写入结果必须仍保留现有兼容面：
   - PNG character cards 可被导出/导入
   - avatar filename 仍是对外可见 identity
   - 现有 delete/rename/duplicate 级联行为保持
3. projection failure 不能把文件重新视为 truth；必须：
   - 返回明确错误
   - 记录 repair intent
   - 保留 DB 已提交状态
4. rollback 到 file-backed writes 前，必须先有 audit 证明 projection 文件足以承接回滚。
5. 现有 destructive confirmation 和 world delete preflight 规则不改变。

错误边界：

- DB commit 前失败：不产生 authority 变更。
- DB commit 后 projection 失败：authority 已变更，需 repair，不能静默回滚到文件 truth。

## 架构 / 约束

- 写入 seam 不能只改 `character-write-service.js`，还必须覆盖 `src/endpoints/characters.js` 中仍然内联的 mutation 路径。
- 继续使用现有路径安全、文件名安全、avatar 校验 helper。
- 不新增未来型 repository 抽象层；只抽取当前 scope 真正重复的 write/projection helper。
- 对 rename/delete/import 等具有文件副作用的动作，DB transaction 与 projection intent 需要有明确顺序记录。

推荐分层：

- `character-store.js`：canonical row CRUD
- `character-write-service.js`：事务与 projection 协调
- `characters.js`：route mapping、request parsing、HTTP response

## 数据 / 集成

输入：

- HTTP mutation payload
- canonical `characters`
- 现有文件系统路径
- feature flags

输出：

- canonical DB row 变更
- PNG projection
- chat directory rename/copy/delete side effects
- repair intent metadata

集成点：

- `src/endpoints/character-write-service.js`
- `src/endpoints/characters.js`
- `src/endpoints/character-index.js`
- 未来 `scripts/canonical-sqlite-repair.mjs`

兼容与迁移事项：

- `avatar_filename` 继续对外可见，但内部应已有稳定 `id`。
- 写路径完成后，derived character index 只能作为非 canonical acceleration 或等待 Phase 5 退场。

## 验证

建议测试：

```bash
bun run --cwd tests test:unit -- character-write-service.test.js --runInBand
bun run --cwd tests test:unit -- worldinfo-delete-cascade.test.js --runInBand
bun run test:compat
```

新增单测应覆盖：

- create/edit/rename 的 DB-first 成功路径
- edit-avatar/edit-attribute/merge/import/duplicate/delete 的 DB-first 成功路径
- DB commit 前失败不产生 authority 变更
- projection failure 记录 repair intent
- rollback 审计前置条件

人工检查：

- 现有角色卡导入导出和删除前 world 依赖检查不变

## Doc ID 契约

无新增 semantic Doc ID。

现有绑定点：

- `feature.character_library_panel`
- `feature.character_delete`
- `feature.world_book_delete`

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `src/endpoints/character-write-service.js`
- `src/endpoints/characters.js`
- `src/endpoints/character-index.js`
- `tests/character-write-service.test.js`
- `tests/worldinfo-delete-cascade.test.js`
- `tests/third-party-extension-compatibility.test.js`

