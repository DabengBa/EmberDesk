---
created: 2026-07-06
source: user-request
confirmed: true
last_updated: 2026-07-06
---

# Legacy Panel Control Cutover

## User Original Request

用户在 Workspace React replacement roadmap 方向中要求逐步完整实现 roadmap 内容，并明确指出仍有面板未加入新架构。本切片对应 `.docs/tech/briefs/260706-01-workspace-react-replacement-roadmap.md` Domain 2：legacy drawer 先进入统一控制，再做 React 内容替换。

## Background & Motivation

`260706-01` 已把 workspace panel owner registry 扩展到九个 primary entries，但 AI Config、Advanced Formatting、User Settings fallback 和 Group Chats 的内容仍由 legacy drawers 拥有。为了避免继续由 legacy button 和 React shell 各自维护打开状态，本切片先把这些 legacy-hosted panels 纳入 registry/dock active 状态，让 shell 统一控制入口、active marker、status、close 和 reopen，同时不迁移高风险表单内容。

## Intent Domains

### Domain 1: legacy-hosted panels become shell-controlled entries

- **User expectation:** AI Config、Advanced Formatting、User Settings fallback、Group Chats 不再是绕过新架构的独立 legacy button 行为，而是从同一个 React shell 入口打开、关闭、再次打开。
- **Current status:** delivered on 2026-07-06.
- **Delivery status:** registry-backed shell entry behavior is covered by source-level helper assertions and focused Playwright E2E proof.
- **Implementation traceability:** `app/workspace-panels.tsx`, `public/script.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/chat-workspace-structure.test.js`, `tests/workspace-shell-panel-navigation.e2e.js`; final archival commit recorded by this wrap-up.
- **Change history:**
  - 2026-07-06: Created this brief from the roadmap Domain 2 intent and the completed delivery evidence so the process spec can be removed without losing user intent.

### Domain 2: legacy content ownership remains unchanged

- **User expectation:** 控制面进入新架构不能顺手复制或重置 provider、prompt、formatting、token、settings、group 等 legacy-owned values。
- **Current status:** delivered on 2026-07-06.
- **Delivery status:** Playwright proof verifies AI Config and Advanced Formatting values survive cross-panel switching; docs record that React shell owns focus/status only.
- **Implementation traceability:** `tests/workspace-shell-panel-navigation.e2e.js`, `.docs/db/features/next-workspace-shell.md`, `.docs/db/pages/chat-workspace.md`, `.docs/db/pages/api-configuration.md`, `.docs/db/pages/settings.md`; final archival commit recorded by this wrap-up.

## Source Evidence

- `.docs/tech/briefs/260706-01-workspace-react-replacement-roadmap.md`
- `.docs/db/features/next-workspace-shell.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/pages/api-configuration.md`
- `.docs/db/pages/settings.md`
- `app/workspace-panels.tsx`
- `public/script.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-workspace-structure.test.js`
- `tests/workspace-shell-panel-navigation.e2e.js`

## Non-Goals

- 不重写 AI provider form、formatting controls、user settings 内容或 group editor/list internals。
- 不新增 API、持久 schema、provider secret 行为或 CSRF/security 行为。
- 不删除 legacy drawer fallback、protected extension surfaces、角色列表 identity selectors 或 public compatibility exports。
