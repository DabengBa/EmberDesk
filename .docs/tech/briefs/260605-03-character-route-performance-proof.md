# Character Route Performance Proof Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

2026-06-05 后续请求：在第 1 步 `character-read-service.js` 已交付并补齐 edge-case tests 后，用户要求对 `.docs/specs/260605-03-character-route-performance-proof/design.md` 重新进入 `$brainstorming`，使该 design 能按当前源码事实交付。

## Intent

本切片聚焦 character route hot path 的可重复性能证据：在 Node 26.3.0 下证明已交付的 `src/endpoints/character-read-service.js`、`/api/characters/all`、`/api/characters/list`、`/api/characters/get`、derived SQLite character index、filesystem fallback 和 interaction runner 的冷/热路径状态。

本切片不再为 route/service extraction 建立前置基线；第 1 步 read service 已由 `ef308b12a` 与 `b5e8abee9` 交付。本切片的目标是把该边界纳入性能/回归证据，而不是重开服务抽取。

2026-06-05 UX 复核后，本切片还需要覆盖“用户是否感知到快”的证据面：角色库首屏可见、首条目可点击、分页后滚动保持、搜索/过滤输入到列表稳定的耗时。骨架屏、首批增量渲染、fallback toast 和无限滚动是有价值的后续 UX 方向，但它们会改变可见行为，不并入这个性能证明切片的实现范围。

## Constraints

- 不以主观感受声明性能收益。
- 不改 canonical character/chat/world-info 文件模型。
- 不把性能 runner 的诊断 headers 写入稳定 JSON API contract。
- 不改变 `character-read-service.js` 的内部 envelope、`filter`/`pagination` no-op context、`latencyHint` 或 HTTP route unwrap 行为。
- Node 26.3.0 是 release proof runtime；非 26.3.0 的本地结果只能作为诊断，不能关闭本切片。
- 不在本切片直接实现角色库骨架屏、分批渲染、fallback toast 或无限滚动；这些需要独立 UI/semantic design。

## Source Trail

- `.docs/tech/interaction-performance-indexing.md`: 记录 character index、read service boundary、interaction runner 与 route headers 的当前实现责任。
- `.docs/tech/bun-workflow.md`: 记录 Node.js 26.3.0 / Bun 1.3.14 runtime 与 script-runner 边界。
- `.docs/PROJECT_HISTORY.md`: 记录第 1 步 character route read service boundary 已交付。
- `src/endpoints/character-read-service.js`: 当前 `/all`、`/list`、`/get` read coordination 所在模块。
- `tests/character-read-service.test.js`: 已覆盖 indexed `/all`、indexed `/list`、filesystem fallback、`/get` lookup/refresh/stat error edge cases。
- `scripts/interaction-performance-runner.mjs`: 当前 interaction A/B runner，会输出 `artifacts/interaction-perf/<timestamp>/report.json`、`report.md`、`samples.json`、`config.json`。
- `src/interaction-performance-report.js`: 当前 payload normalization、route-path validation 与 metric summary 逻辑。
- `public/script.js`: 当前 `printCharacters()` 通过 pagination callback 调用 `renderCharacterListPage()`，full path 会清空并一次性写入当前页；search 使用 `debounce_timeout.quick` 后设置 filter。
- `.docs/db/features/character-library-panel.md`: 用户语义要求大库和 repeat-open 保持可用、感觉像 steady-state interaction。
- `PRODUCT.md` / `DESIGN.md`: 产品 UI 规则支持 loading skeleton 作为后续 UX 方向，但当前 spec 仍不做可见行为变更。
- Node.js 26.3.0 release note: `https://nodejs.org/en/blog/release/v26.3.0`。
- Node.js SQLite API docs: `https://nodejs.org/api/sqlite.html`。

## Assumptions

- 本机当前 `node --version` 为 `v26.3.0`、`bun --version` 为 `1.3.14`，可以作为本切片的本地 release proof runtime；delivery 仍需把实际输出记录到 audit。
- 性能 runner 结果受机器负载影响。本切片要求可重复证据、payload 等价、path 可信和 warnings 可解释，不把固定百分比性能提升作为硬门槛。
- runner 产物是 audit/evidence 输入，默认不提交 `artifacts/interaction-perf/**`，除非后续 delivery 明确选择提交精简报告。
- web.dev “15-20% 感知等待改善”这类外部百分比未作为本切片硬依据；本设计只采用本仓库可测的用户感知指标。

## Implementation Traceability

- Report model: `src/interaction-performance-report.js` now summarizes route, delete-refresh, and character-library UX metrics; guarded by `tests/interaction-performance-report.test.js`.
- Runner proof: `scripts/interaction-performance-runner.mjs` now includes `character_delete_refresh_ui`, `character_library_first_interactive`, `character_library_filter_response`, and `character_library_pagination_scroll` in the suite; app scenarios honor `--repeats`.
- Browser measurement seam: `public/script.js` exposes `measureCharacterSearchForPerf()` only on `/?emberdesk_perf_hooks=1`; normal UI entry points do not receive a stable API surface from this proof hook.
- Full-app reliability: `public/scripts/power-user.js` skips resize-time autocomplete adjustment until the jQuery UI instance exists, preventing early full-app proof page errors.
- Static guards: `tests/character-list-structure.test.js` covers the perf-only search hook, app-scenario repeat sampling, autocomplete initialization guard, and existing character-list DOM compatibility seams.
- Durable docs: `.docs/tech/interaction-performance-indexing.md` records the scenario set, metric names, artifact policy, reliability controls, and 2026-06-05 Node 26.3.0 proof shape; `.docs/PROJECT_HISTORY.md` records this delivery node.
- Final local proof: `artifacts/interaction-perf/2026-06-05T06-56-33-800Z/report.md` recorded 8/8 scenarios with `Valid pairs: 1/1`, JSON `warnings: []`, and character-library UX evidence. Raw artifacts remain local evidence and are not committed by default.
- Delivery status: implemented, reviewed, validated, and archived in the containing wrap-up commit on 2026-06-05.

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 2 步的用户意图。
- 2026-06-05: 根据已交付的 character read service 和 edge-case tests，更新本 brief：第 3 个 spec 不再设计 route/service extraction，而是证明当前 read service/index hot path 在 Node 26.3.0 下可重复验证。
- 2026-06-05: 接受 UX 复核中“proof 不能只看 API latency”的意见，新增首屏可见、首条目可点击、过滤响应和分页滚动保持的测量意图；将 skeleton、incremental first batch、fallback toast、infinite scroll 标记为后续 UI slice。
- 2026-06-05: delivery 后冻结实现追溯：runner/report/frontend perf hook、autocomplete guard、focused tests、Node 26.3.0 proof report 与 durable docs 均已落地。
- 2026-06-05: review correction 后更新追溯：`firstListItemClickableMs` 改为等待应用选中态，`summarizeScenarioPayload(character_library_*)` 增加直接单测，filter 指标文档明确不包含 debounce。
