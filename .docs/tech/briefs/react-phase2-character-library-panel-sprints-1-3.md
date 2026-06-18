---
created: 2026-06-18
source: user
confirmed: true
last_updated: 2026-06-18
---

# React Character Library Panel Sprints 1-3 Intent

## User Original Request

用户通过 `$delivery-workflow` 明确要求继续推进以下 3 个 Phase 2 规格的真实交付，而不是只做讨论或路线图说明：

- `.docs/specs/react-phase2-sidebars/phase2-sprint1-character-library-list.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint2-character-library-search.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint3-character-library-bulk.md`

用户随后进一步确认了这 3 个 Sprint 的用户感知边界：Sprint 2 是搜索/标签过滤/排序，Sprint 3 是批量选择、删除和标签管理；并要求继续把这组工作推进到可执行、可验证的交付状态。

## Background & Motivation

当前仓库已经有一条较强的角色库基础能力链路：`/api/characters/all` 的读服务、SQLite 加速、`public/script.js` 的分页和增量 reconcile、`character-list-state.js` / `character-list-render-state.js` 的纯 helper，以及严格的 DOM 兼容测试。与此同时，Phase 2 现有 sprint 文档仍停留在理想化描述，缺少 `delivery-workflow` 所需的 `brief/spec/plan` 工件，也没有把主工作区 character library 与 Phase 1 独立 page islands 的边界区分清楚。

用户的真实目标不是把 `World Info`、`Backgrounds`、`Extensions` 混进来，而是先把 character library 这一块做成受 feature flag 控制、可回退、可验证的 React panel island，同时保持搜索、排序、标签过滤、批量操作和现有兼容表面继续成立。

## Intent Domains

### Domain: 主工作区角色库 React panel island

- **User expectation:** 在 legacy chat workspace 内，把角色库面板迁移成受控的 React island，而不是单独新开一个 route 页面；feature flag 关闭或 bundle 不可用时，现有 jQuery 面板仍可回退使用。
- **Current status:** delivered
- **Change history:**
  - 2026-06-18: 用户要求继续按 `delivery-workflow` 推进 Phase 2 角色库 Sprint 1-3
  - 2026-06-18: 用户确认 Sprint 2 是搜索/过滤/排序，Sprint 3 是批量管理，并要求继续向真实实现推进
- **Implementation traceability:** code paths `default/config.yaml`, `src/react-character-library-feature.js`, `src/workspace-react-features.js`, `src/server-main.js`, `public/script.js`, `public/scripts/bulk-edit.js`, `public/scripts/BulkEditOverlay.js`, `public/style.css`, `app/character-library-panel.tsx`, `app/components/character-library/*`, `app/lib/character-library-helpers.ts`, `vite.config.ts`; tests `tests/character-library-react-panel-flag.test.js`, `tests/character-library-react-helpers.test.js`, `tests/character-list-structure.test.js`, `tests/character-list-render-state.test.js`, `tests/character-list-state.test.js`, `tests/character-read-service.test.js`, `tests/interaction-performance-index.test.js`, `tests/third-party-extension-compatibility.test.js`; owning docs `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/react-modernization-roadmap.md`, `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`; commit `572cbab75 feat(react): let the character library settle in`; delivery status `delivered`

### Domain: 搜索、排序、标签过滤保持可用

- **User expectation:** 完成 Sprint 1-3 后，角色库不只是“能显示”，还必须继续支持搜索、标签过滤、排序，并且这些能力对用户来说是正常可用的，不因为 React 迁移而倒退。
- **Current status:** delivered
- **Change history:**
  - 2026-06-18: 用户明确追问 “那么完成这个 sprint 之后，加入用户使用搜索功能，能够正常搜索吗?”
  - 2026-06-18: 用户随后要求继续执行这组 Sprint 的交付
- **Implementation traceability:** code paths `public/script.js`, `app/components/character-library/CharacterLibraryToolbar.tsx`, `app/components/character-library/CharacterLibraryPanel.tsx`, `app/lib/character-library-helpers.ts`; tests `tests/character-library-react-helpers.test.js`, `tests/character-list-structure.test.js`, `tests/interaction-performance-index.test.js`; owning docs `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/react-modernization-roadmap.md`; commit `572cbab75 feat(react): let the character library settle in`; delivery status `delivered`

### Domain: 批量操作与兼容 DOM 合约保持成立

- **User expectation:** 完成 Sprint 3 后，checkbox 批量选择、全选/取消、批量删除、批量标签管理继续工作，`.bulk_select_checkbox`、`.character_selected`、`.tags_inline` 等兼容选择器不能被破坏。
- **Current status:** delivered
- **Change history:**
  - 2026-06-18: 用户确认 Sprint 3 的内容就是角色库批量操作
  - 2026-06-18: 用户要求继续推进到真实交付
- **Implementation traceability:** code paths `public/scripts/bulk-edit.js`, `public/scripts/BulkEditOverlay.js`, `public/script.js`, `app/components/character-library/CharacterLibraryToolbar.tsx`, `app/components/character-library/LegacyElementHost.tsx`; tests `tests/character-list-state.test.js`, `tests/character-list-structure.test.js`, `tests/third-party-extension-compatibility.test.js`; owning docs `.docs/db/features/character-delete.md`, `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`; commit `572cbab75 feat(react): let the character library settle in`; delivery status `delivered`

### Domain: 严格推动 TanStack 栈采用

- **User expectation:** React 现代化路线继续严格推动 `TanStack Form`、`TanStack Query`、`Zod`；对列表性能问题，需要诚实引入适合的 TanStack Virtual，而不是在 Sprint 文档里写了却不真正落地。
- **Current status:** delivered
- **Change history:**
  - 2026-06-16: 用户已在 Phase 1 明确要求路线图严格推动 `TanStack Form` / `TanStack Query` / `Zod`
  - 2026-06-18: 该要求延续到 Phase 2 角色库 React 迁移
- **Implementation traceability:** code paths `package.json`, `bun.lock`, `app/character-library-panel.tsx`, `app/components/character-library/*`, `app/lib/character-library-helpers.ts`, `vite.config.ts`; tests `tests/character-library-react-panel-flag.test.js`, `tests/character-library-react-helpers.test.js`; owning docs `.docs/tech/react-modernization-roadmap.md`, `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`; commit `572cbab75 feat(react): let the character library settle in`; delivery status `delivered`

## Non-Goals

- 本轮不迁移 `World Info`、`Backgrounds`、`Extensions`
- 本轮不把 chat workspace 整体改造成 SPA，也不接管消息列表/输入框
- 本轮不改变 `/api/characters/all`、`/api/characters/list`、`/api/characters/get` 的 HTTP payload 形状
- 本轮不重做第三方扩展挂载点、`@sillytavern/*` alias、`eventSource` / `event_types` 公共契约

## Source Evidence

- `.docs/specs/react-phase2-sidebars/phase2-sprint1-character-library-list.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint2-character-library-search.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint3-character-library-bulk.md`
- `.docs/db/features/character-library-panel.md`
- `.docs/db/features/character-delete.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `public/script.js`
- `public/scripts/bulk-edit.js`
- `public/scripts/BulkEditOverlay.js`
- `app/character-library-panel.tsx`
- `tests/character-library-react-panel-flag.test.js`
- `tests/character-library-react-helpers.test.js`
