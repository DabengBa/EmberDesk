# Brief: SQLite Sidecar Helper Foundation

## Original Request

根据 `.docs/tech/briefs/260604-05-data-storage-layer-investigation.md` 和 `.docs/tech/briefs/260604-06-data-storage-optimal-solution.md` 的已核实内容，编写一个可交付的升级 spec。

## Background

当前项目已经有一个成熟的 `node:sqlite` 派生索引实现：`src/endpoints/character-index.js`。两份存储 brief 已核实：

- 文件系统仍是 canonical data source
- SQLite sidecar 应继续保持派生缓存定位
- 不应直接设计“数据库化存储层迁移”
- 第一个最小切片应优先提取可复用的 SQLite sidecar helper，为后续实体索引扩展建立边界

## Confirmed Facts

- 当前应用 runtime 是 Node.js 26.3.0 Current，不是 Bun runtime。
- `character-index.js` 已经具备成熟的 sidecar 行为：runtime feature detection、WAL、schema version reset、cached handle、fallback/self-heal、dirty-row refresh。
- `worldinfo.js` 目前不是世界信息实体索引，只通过 `findCharactersBoundToWorld()` 使用角色 sidecar 做绑定反查。
- `node-persist` 仍是用户账户类 key-value 存储，没有证据支持近期替换。
- Fuse.js 已被前端多个模块使用，不是 unused dependency。

## Confirmed Decisions

- 本 spec 只设计第一个可交付切片：提取 SQLite sidecar helper foundation。
- 本 spec 不设计新的实体索引实现，不替换 `node-persist`，不引入 Drizzle，不引入 Bun.SQL。
- 本 spec 不做文件系统 canonical model 升级或迁移；文件系统读写是否需要优化必须另按具体热点 profile 设计。
- 本 spec 目标是把可复用但非业务特定的 sidecar 生命周期逻辑从 `character-index.js` 抽离出来，同时保持现有角色索引行为不变。
- 本 spec 接受 review 反馈，把可观测性、统一 SQLite PRAGMA、独立 helper 测试、单进程约束写入设计；启动期必须能看到解析后的 mode，但不在本切片新增 `/health` 或 `/api/settings` 状态端点。
- helper 模块名收敛为 `src/derived-cache-sqlite.js`，强调 SQLite 文件仍是派生缓存而非 canonical storage。

## Intent Domains

| Domain | Intent | Status |
|---|---|---|
| First shippable slice | 把存储层调研收敛成一个最小、低风险、可验证的设计切片 | Confirmed |
| Derived-cache boundary | 继续把 SQLite 保持为派生 sidecar，而不是 canonical storage | Confirmed |
| Scope control | 不把世界信息索引、搜索层替换、ORM 引入、runtime 迁移混进同一切片 | Confirmed |
| Observability | helper 需要提供启动日志、状态查询纯函数、reset 计数和轻量熔断，避免静默 fallback | Confirmed |

## Implementation Traceability

| Intent Domain | Code / Doc Path | Delivery Status |
|---|---|---|
| First shippable slice | `src/derived-cache-sqlite.js`, `src/endpoints/character-index.js`, `tests/derived-cache-sqlite.test.js` | Delivered in the wrap-up commit for this brief |
| Derived-cache boundary | `.docs/tech/derived-cache-sqlite.md`, `.docs/tech/interaction-performance-indexing.md` | Delivered; docs state filesystem data remains canonical and SQLite is rebuildable derived state |
| Scope control | `src/endpoints/character-index.js`, `.docs/tech/derived-cache-sqlite.md` | Delivered; no world info/chat/preset/settings sidecar, search replacement, ORM, Bun runtime path, or filesystem migration was added |
| Observability | `src/derived-cache-sqlite.js`, `src/server-main.js`, `src/endpoints/character-index.js`, `tests/derived-cache-sqlite.test.js` | Delivered; startup mode logging, structured sidecar logs, pure status wrappers, reset counts, and circuit breaking are covered |

## Unresolved Questions

无。当前请求足够收敛，可以直接形成设计。

## Change History

- 2026-06-04: 初始创建，基于 260604-05 / 260604-06 两份核实版 brief 收敛为首个可交付切片。
- 2026-06-04: 根据 review 反馈修订范围，纳入 helper 可观测性、PRAGMA 基线、独立测试、单进程约束和技术文档可发现性；明确不新增 HTTP health/status endpoint。
- 2026-06-04: 交付完成，实施追踪写回本 brief；持久架构事实已迁入 `.docs/tech/derived-cache-sqlite.md`、`.docs/tech/interaction-performance-indexing.md` 和 `.docs/PROJECT_HISTORY.md`。
