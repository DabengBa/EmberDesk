---
created: 2026-07-06
source: user-request
confirmed: true
last_updated: 2026-07-06
---

# Workspace React Replacement Roadmap Specs

## User Original Request

用户要求使用 `$brainstorming` 编写多个 specs，逐步完整实现新的 workspace / panel roadmap，并强调“完整实现 roadmap 内容，实现真实的替换”。

## Background & Motivation

当前 EmberDesk 已经有 same-entry React workspace shell、panel dock coordination、Character Library / World Info / Backgrounds / Extensions / Main Chat Message List 等 React islands，但仍保留大量 legacy drawer、jQuery controller、compatibility facade 和 fallback owner。近期真实浏览器测试暴露了 shell dock state、legacy drawer state、fixed bundle cache 和快速切换之间的状态机问题；这些问题说明“guarded island + fallback”已经不足以表达最终替换目标。

旧 `.docs/tech/react-modernization-roadmap.md` 记录 Phase 0-7 已完成并进入兼容维护，但该状态是当时的路线图完成定义；本次用户明确重开后续 replacement roadmap，要求以真实 owner 替换为目标，而不是继续停留在 island/fallback 维护状态。

## Intent Domains

### Domain 1: 先统一控制面，再替换内容面

- **User expectation:** 不再为每个面板重复修状态机，而是建立统一的 panel owner registry、open/close/toggle/active/fallback/error 协议。
- **Current status:** planned by spec set `260706-01`。
- **Delivery status:** delivered on 2026-07-06. The registry now covers AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring; same-entry open/close/reopen and pinned-close truthfulness are covered by unit, E2E, and Chrome DevTools walkthrough evidence.
- **Change history:**
  - 2026-07-06: 创建本 brief，把 panel state 统一收口设为后续所有替换的前置条件。
  - 2026-07-06: 按 `$grill-with-docs` 要求做联网和仓库压力测试；外部 ARIA 资料支持同一 panel entry 的 toggle 语义，外部 strangler-fig 资料支持渐进替换但要求明确 cutover/decommission 门，因此 `260706-01` 继续保持“先 registry/control plane”的最小可交付切片，而不提前重写内容面。
  - 2026-07-06: 按用户要求引入 Claude Code 只读 UI 顾问，并结合 `beautify-ui`、`impeccable` 与项目 PRODUCT/DESIGN 约束；结论写回 `260706-01`：所有 registry entry 复用现有 dense/workshop shell 语言，状态 copy 固定且低噪声，pinned close 导致 `aria-pressed` 与可见 drawer 不一致属于本规格必须修的可访问性 Tiger。
  - 2026-07-06: `260706-01` 已交付并进入 wrap-up；长期事实已移入 `.docs/db/features/next-workspace-shell.md`、`.docs/db/pages/chat-workspace.md`、`.docs/tech/workspace-shell-panel-dock-coordination.md`、`.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`、`.docs/project-overview.md` 和 `.docs/PROJECT_HISTORY.md`。
- **Implementation traceability:** `app/workspace-panels.tsx`, `app/stores/workspace-panel-store.js`, `public/script.js`, `public/scripts/workspace-panels-react-bridge.js`, `app/components/character-library/CharacterLibraryPanel.tsx`, `public/scripts/world-info.js`, `tests/react-state-stores.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/character-library-react-helpers.test.js`, `tests/world-info-card-rendering.test.js`, `tests/workspace-shell-panel-navigation.e2e.js`; shipped in commit `e9c067ab8 feat(workspace): teach panel registry to keep its promises`.

### Domain 2: legacy drawer 先进入统一控制，再做 React 内容替换

- **User expectation:** AI Config、Advanced Formatting、User Settings、Group Chats 等仍未纳入新架构的面板，需要逐步进入 shell/dock owner，而不是继续由 legacy button 独立控制。
- **Current status:** delivered on 2026-07-06 by spec set `260706-02`。
- **Delivery status:** AI Config、Advanced Formatting、User Settings fallback、Group Chats 已进入 registry-backed shell control，same-entry open/close/reopen 和 legacy value preservation 有 focused unit/E2E proof。
- **Change history:**
  - 2026-07-06: 把“控制面纳入”与“内容 React 化”拆开，降低一次性替换风险。
  - 2026-07-06: `260706-02` 已交付并归档；长期事实已移入 `.docs/db/features/next-workspace-shell.md`、`.docs/db/pages/chat-workspace.md`、`.docs/db/pages/api-configuration.md`、`.docs/db/pages/settings.md`、`.docs/PROJECT_HISTORY.md` 和 `.docs/tech/briefs/260706-02-legacy-panel-control-cutover.md`。
- **Implementation traceability:** `app/workspace-panels.tsx`, `public/script.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/chat-workspace-structure.test.js`, `tests/workspace-shell-panel-navigation.e2e.js`, `.docs/tech/briefs/260706-02-legacy-panel-control-cutover.md`; archival commit `bfc11a447 docs(workspace): stamp panel registry wrap-up trace`.

### Domain 3: 高风险 authoring 面板必须作为真实替换切片

- **User expectation:** 角色创建/编辑、群组创建/编辑不能只做 shell 按钮代理；需要最终变成 React owner，同时保留角色列表、selector、扩展和文件写入兼容。
- **Current status:** delivered on 2026-07-06 by spec set `260706-03`。
- **Delivery status:** Character Authoring 与 Group Authoring 现在在原有右侧 drawer host 内由 guarded React authoring surface 作为正常可见 owner，legacy save/delete/export/world-info seam 与角色列表、群组文件、扩展兼容边界保持不变。
- **Change history:**
  - 2026-07-06: 把 Character / Group authoring 设为单独规格，避免混入普通 drawer 控制迁移。
  - 2026-07-06: `260706-03` 已交付并进入 wrap-up；长期事实已移入 `.docs/db/features/character-library-panel.md`、`.docs/db/features/group-authoring.md`、`.docs/db/pages/chat-workspace.md`、`.docs/db/terms/character-card.md`、`.docs/db/features/next-workspace-shell.md`、`.docs/project-overview.md`、`.docs/tech/workspace-shell-panel-dock-coordination.md`、`.docs/PROJECT_HISTORY.md` 和 `.docs/tech/briefs/260706-03-character-group-authoring-replacement.md`。
- **Implementation traceability:** `public/scripts/character-authoring.js`, `public/scripts/group-authoring.js`, `public/scripts/group-chats.js`, `public/script.js`, `app/workspace-panels.tsx`, `tests/character-authoring-facade.test.js`, `tests/group-authoring-facade.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/character-group-authoring.e2e.js`, `.docs/tech/briefs/260706-03-character-group-authoring-replacement.md`.

### Domain 4: 已有 React islands 需要从 action-host 深化为 content owner

- **User expectation:** World Info、Backgrounds、Extensions 当前仍大量调用 legacy action/facade；后续要逐步真实替换内容和交互 owner。
- **Current status:** planned by spec set `260706-04`。
- **Change history:**
  - 2026-07-06: 把现有 islands 的“深化替换”列为单独规格，而不是重写 Phase 2。
- **Implementation traceability:** `.docs/specs/260706-04-supporting-panel-content-replacement/spec.md`。

### Domain 5: 删除 legacy path 必须有兼容门和回滚冻结决策

- **User expectation:** “真实替换”不能只新增 React path；每个 legacy fallback、DOM owner、public export 都要有删除、冻结或长期支持决定。
- **Current status:** planned by spec set `260706-05`。
- **Change history:**
  - 2026-07-06: 把 cutover/delete gate 作为独立最终规格，继承 JS-Slash-Runner 和 protected surface 兼容门。
- **Implementation traceability:** `.docs/specs/260706-05-legacy-cutover-and-deletion-gates/spec.md`。

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/workspace-shell-panel-dock-coordination.md`
- `.docs/db/features/next-workspace-shell.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `public/script.js`
- `app/workspace-panels.tsx`
- `app/stores/workspace-panel-store.js`
- `public/scripts/workspace-panel-host-controller.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `tests/workspace-shell-panel-navigation.e2e.js`
- `https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed`
- `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import`
- `https://martinfowler.com/bliki/StranglerFigApplication.html`
- `https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig`

## Non-Goals

- 不在 brainstorming 阶段实现代码。
- 不新增 separate `/workspace-next` route。
- 不把 Express/Hono、Drizzle、file-backed storage 或 Electron 迁移混入本 spec set。
- 不删除 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`、protected extension mount points 或角色列表 identity selectors，除非后续 cutover spec 明确给出兼容证据和迁移门。
