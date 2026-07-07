# Canonical SQLite DB-First Reads

## 意图与核心流程

一句话意图：在 audit 通过后，把 character list/get 的 steady-state read authority 切到 canonical DB，同时保持现有 route payload 和前端/扩展兼容。

主要参与者或触发条件：

- Phase 2 开始
- shadow import/audit 已通过
- `features.storage.canonicalSqlite.enabled=true`
- `features.storage.canonicalSqlite.reads=true`

主路径顺序：

1. `character-read-service.js` 进入 DB-first 分支。
2. `/api/characters/all`、`/api/characters/list`、`/api/characters/get` 优先从 canonical DB 读取。
3. 在 DB 不可用、migration blocked、audit drift 或 flag disabled 时返回明确 fallback reason。
4. 必要时回退到 file-backed 读路径，但不得把 derived index 当成 canonical authority。

## 范围 / 不做范围

本次要改变什么：

- 切换 character read service 的 steady-state authority。
- 为 route parity、fallback reason 和严格模式提供可验证行为。

不做范围：

- 不切换任何 write route。
- 不更新 chat message bodies 存储。
- 不处理 full World Info canonicalization。
- 不把 `/recent` 或 `/search` 的 chat 路由改为 DB-backed；它们仍由 chat stats spec 之外的未来工作负责。

第一个可交付切片：

- 只覆盖 `readCharacterListPayload()`、`readCharacterSummaryPayload()`、`readCharacterFullPayload()`。

## 边界规则 / 验收

验收项：

1. 以下 route 的 JSON shape 与现状保持一致：
   - `/api/characters/all`
   - `/api/characters/list`
   - `/api/characters/get`
2. character-list identity 相关字段保持兼容：
   - avatar filename
   - `data-chid` / legacy `chid` 依赖的 payload 结构
   - `.character_select` 等前端 selector 所需字段
3. fallback reason 至少可区分：
   - flag disabled
   - unsupported runtime
   - migration failed
   - audit drift blocked
   - DB unavailable
4. 当 `strict=true` 时，上述 fallback 在测试/开发中应显式失败，而不是静默吞掉。
5. derived `_cache/character-index.sqlite` 不再被视为 DB-first read 的 authority fallback；最多作为旧路径的 file-compat acceleration。

恢复规则：

- 关闭 `reads` 后可回到 file-backed reads，且不需要删除 canonical DB。
- rollback 后仍可继续运行 shadow import/audit。

## 架构 / 约束

- read seam 必须留在 `src/endpoints/character-read-service.js`，不要把 route 逻辑散回 `characters.js`。
- 保持现有 dependency injection/test seam 风格，方便复用现有测试。
- `filter`/`pagination` 仍按当前 contract 处理；不得借此 phase 偷带新查询语义。
- `/get` 若仍需文件 stat 作兼容检查，只能作为 rollback/projection completeness 辅助，不得重新把文件变回 authority。

建议实现边界：

- 新增 `character-store.js` 或等价 query helper，负责 DB 查询与 payload 组装。
- `character-read-service.js` 只负责协调 flag、fallback、logging、parity hooks。

## 数据 / 集成

输入：

- canonical `characters`
- canonical `character_chat_stats`
- feature flags
- 可选 audit status

输出：

- 与当前一致的 `/api/characters/*` payload
- 可观测 fallback reason

集成点：

- `src/endpoints/character-read-service.js`
- `src/endpoints/characters.js`
- 未来 `src/endpoints/character-store.js`
- `src/validation-gate-selector.js`

兼容事项：

- 前端 DOM identity 和扩展期望字段必须原样保留。
- `public/script.js`、character library React/jQuery 兼容面不应感知 authority 已切换。

## 验证

建议测试：

```bash
bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js --runInBand
bun run test:compat
```

新增单测应覆盖：

- DB-first `/all`、`/list`、`/get` payload parity
- disabled/runtime unsupported/migration blocked/audit drift 的 fallback reason
- strict mode 失败路径
- rollback 到 file-backed 后 payload 仍一致

人工检查：

- character library 列表、详情、删除前选择态不应出现兼容性回归

## Doc ID 契约

无新增 semantic Doc ID。

现有绑定点：

- `feature.character_library_panel`
- `page.chat_workspace`

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `src/endpoints/character-read-service.js`
- `src/endpoints/characters.js`
- `src/endpoints/character-index.js`
- `public/script.js`
- `tests/character-read-service.test.js`
- `tests/interaction-performance-index.test.js`
- `tests/third-party-extension-compatibility.test.js`

