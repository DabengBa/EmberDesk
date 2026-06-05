# Character List Page Slice Helper Brief

## Intent

用户要求在阅读并更新 `.docs/tech/modernization-roadmap.md` 后，按 `$brainstorming` 为下一步 modernization 工作编写可交付设计。当前路线图已决定下一步是 `public/script.js` 内的 character-list helper extraction，且先做设计/映射，不直接移动 DOM 代码。

## Background

- Node 26.3 validation sweep 已完成，路线图把下一步收敛到 character-list helper extraction。
- 已有 helper 边界包括 `public/scripts/character-list-state.js` 和 `public/scripts/character-list-render-state.js`。
- `.docs/logic-description/character_list_state_processing_flow.md` 已记录 character-list 当前状态流、增量 reconcile、删除后分页和 bulk-selection 规则。
- `.docs/db/features/character-library-panel.md` 已定义稳定用户可见语义和 row identity 合约。

## User Outcome

本次设计应让后续 `delivery-workflow` 能安全抽出一个确定性 helper，减少 `public/script.js` 中 character-list 分页/渲染决策的局部复杂度，同时保持用户看到的 character library 行为完全等价。

## Constraints

- 不改变 character-list UI、copy、card layout、分页标签、bulk-select 行为或删除 fallback 规则。
- 不改变 `.character_select`、`.group_select`、`.bogus_folder_select`、`data-chid`、legacy `chid`、`id="CharID${chid}"`、`.character_selected`、`.bulk_select_checkbox`、`.tags_inline`、`.ch_fav`。
- 不改变 endpoint response、cache/index、world-info cascade、extension import alias 或 `eventSource` / `event_types` 兼容面。
- 优先扩展现有 `character-list-render-state.js`，不新增 controller、renderer 或未来扩展层。

## Recommended Default

选择 `getCharacterListPageEntities(snapshot, currentPage, pageSize)` 作为第一个最小 helper：它当前在 `public/script.js` 中是纯分页切片逻辑，只读取参数并返回 `snapshot.entities` 的页切片，正好属于 render-state 决策边界。

## Delivery Traceability

- Delivery status: delivered on 2026-06-05.
- Code paths: `public/scripts/character-list-render-state.js`, `public/script.js`.
- Test paths: `tests/character-list-render-state.test.js`, `tests/character-list-structure.test.js`, `tests/third-party-extension-compatibility.test.js`.
- Durable docs: `.docs/PROJECT_HISTORY.md`, `.docs/tech/interaction-performance-indexing.md`, `.docs/tech/modernization-roadmap.md`.
- Validation: `character-list-render-state.test.js` red-to-green, focused character-list structure tests, `bun run test:compat`, `bun run lint`, and `bun run docs:check`.

## Intent Domains

### 2026-06-05

- 确认本次不是 UI redesign，也不是 character-list controller split。
- 确认本次只设计一个可测试的纯 helper extraction，并把 DOM-bound / jQuery pagination-bound 逻辑留在 `public/script.js`。
- 交付后确认 `getCharacterListPageEntities()` 已进入 `character-list-render-state.js`，`public/script.js` 继续拥有 DOM patch、pagination plugin state、row identity、`CHARACTER_PAGE_LOADED` 和 extension compatibility。

## Source Trail

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/modernization-phase1-complexity-map.md`
- `.docs/logic-description/character_list_state_processing_flow.md`
- `.docs/db/features/character-library-panel.md`
- `public/script.js`
- `public/scripts/character-list-state.js`
- `public/scripts/character-list-render-state.js`
- `tests/character-list-render-state.test.js`
- `tests/character-list-structure.test.js`
