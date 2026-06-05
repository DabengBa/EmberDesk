# Character Route Service Extraction Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 1 步聚焦 `src/endpoints/characters.js`：先抽出一个小而确定的 character route read service/helper 边界，让 `/api/characters/all`、`/api/characters/list` 与 `/api/characters/get` 的 file-backed 行为、derived cache fallback、interaction perf metadata、path guard 和 response shape 保持等价。

这一步不是把整个 `characters.js` 拆完，而是为后续 character route modernization 建立第一个可测试的服务边界。

## Outcome Constraint

本切片仍是 behavior-equivalent backend refactor，但 service 边界不能只服务当前 route handler 拆分；它还必须为 10-step roadmap 的角色库体验目标保留接口空间。第 10 步完成后，`feature.character_library_panel` 应能朝以下方向演进：

- 角色库 repeat-open 与常见列表操作接近即时反馈；大库场景不应因为每次重扫所有角色而掉帧。
- 角色搜索、标签过滤、排序、分页或虚拟滚动应能复用同一个 read service context，而不是重新绕过 service。
- 批量删除、标签操作和后续 command palette 入口应能拿到可区分的 snapshot/delta 语义，方便 optimistic UI 与 undo flow。
- index-first fast path 与 filesystem fallback 应能向上层表达大致 latency class，为后续 skeleton suppression 或 loading strategy 提供信号。

本切片不实现上述 UX；它只要求第一个 read service API 不把这些后续能力排除在边界之外。

## Constraints

- 不做 broad endpoint split。
- 不改变 character endpoint response shape。
- 不把 SQLite character index 或 DiskCache 当作 canonical storage。
- 路径与文件名校验继续使用现有 guard。
- 不改变 create/edit/delete/import/duplicate/export 等写路径的 thumbnail invalidation、thumbnail pregeneration、character-index refresh/delete 副作用。
- 不把 `readFromV2`、`getCharaCardV2`、import format conversion 或 avatar image write/crop 作为本切片目标。

## Source Trail

- `.docs/tech/modernization-roadmap.md`: 10-step closure plan 把第 1 步定义为 character route service extraction，并要求保持 `/api/characters/all`、`/api/characters/get`、cache/index refresh、thumbnail side effects、path guards 和 file-backed canonical storage 稳定。
- `.docs/tech/modernization-phase1-complexity-map.md`: `src/endpoints/characters.js` 是高风险 backend route；安全候选是 route service wrappers，不应先做 broad endpoint file split。
- `.docs/tech/interaction-performance-indexing.md`: 当前 `/api/characters/all` 与 `/api/characters/get` 的 SQLite fast path 必须保持 file-authoritative fallback、interaction perf headers、chat/world-info freshness 与 derived-only cache 语义。
- `.docs/db/features/character-library-panel.md`: 角色库已记录大库可用性、重复打开、搜索/过滤/分页增量渲染、bulk-selection 状态同步与 derived summary reuse 的用户体验约束。
- `src/endpoints/characters.js`: `/all`、`/list`、`/get` 当前重复执行 sorted PNG list、index-first read、filesystem fallback、indexed fallback refresh 和 perf path 选择。
- `tests/interaction-performance-index.test.js`: 现有 route tests 直接定位 `/all`、`/list`、`/get` handler，并覆盖 indexed/fallback/metadata 行为。
- Msty Studio Command Palette docs (`https://docs.msty.studio/settings/command-palette`) 与 2.6.0 blog (`https://msty.ai/blog/msty-studio-2-6-0-command-center/`): `Cmd/Ctrl+K` command palette 和 context-aware actions 是同类 AI workspace 的高影响力导航面；本 brief 只把它作为方向性 UX 约束，不把竞品版本号当作 EmberDesk contract。
- SillyTavern 1.17.0 GitHub release notes (`https://github.com/SillyTavern/SillyTavern/releases/tag/1.17.0`): 上游已继续投资 virtual folders、grid/breadcrumbs、tag cleanup 和 character management slash commands；本切片应避免锁死后续角色库搜索、过滤和程序化角色操作的 read path。

## Assumptions

- 第 1 步只设计第一个可交付切片；其余 9 步保留为 roadmap queue，后续每一步进入 `$brainstorming` 时再按当时源码事实生成独立 design。
- 本切片允许新增一个 route-adjacent service module，但 production route URL、middleware、request body contract 和 JSON response 不变。
- 因为本切片是 backend behavior-equivalent refactor，不新增 `.docs/db` Doc ID；仅绑定既有 `feature.character_library_panel`、`term.character_card` 与 `page.chat_workspace` 作为受保护语义面。

## Implementation Traceability

- Delivery status: delivered on 2026-06-05.
- Code paths:
  - `src/endpoints/character-read-service.js`: new route-adjacent read service for `/api/characters/all`, `/api/characters/list`, and `/api/characters/get`.
  - `src/endpoints/characters.js`: Express handlers now unwrap service snapshot envelopes while preserving existing HTTP status, body, and interaction header contracts.
  - `tests/character-read-service.test.js`: focused service coverage for index-first reads, filesystem fallback, `/get` indexed/fallback behavior, future `filter`/`pagination` no-op context, and latency hints.
- Validation:
  - `bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js --runInBand`
  - `bun run lint`
  - `bun run lint` from `tests/`
- Scope result: no endpoint URL, request body, JSON response shape, frontend selector, SQLite schema, canonical file storage, mutation route, or thumbnail side effect changed.

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 1 步的用户意图。
- 2026-06-05: 明确本切片只做第一个 read service boundary，不一次性为 10 个独立系统写满实现级设计。
- 2026-06-05: 追加 UX 竞争力复核结论：第 1 步仍保持后端等价重构，但 read service 边界必须为搜索/过滤、增量列表更新、command palette 和 loading strategy 预留语义空间。
- 2026-06-05: 交付第 1 步 read service boundary；HTTP contract 保持等价，内部 service envelope 预留 snapshot/delta 与 latency hint 语义。
