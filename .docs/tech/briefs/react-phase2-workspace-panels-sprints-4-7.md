---
created: 2026-06-18
source: user
confirmed: true
last_updated: 2026-06-19
---

# React Phase 2 Workspace Panels Sprints 4-7 Intent

## User Original Request

用户通过持久目标继续要求运行 `$delivery-workflow`，目标文件为：

- `.docs/specs/react-phase2-sidebars/phase2-sprint4-world-info-editor.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint5-world-info-import.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint6-background-library.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint7-extensions-host.md`

当前 `delivery-workflow` 对 `.docs/specs/react-phase2-sidebars` 的 stage 检测只因 process files 已删除而返回 `complete`；但该目录没有 approved `spec.md`、`plan.md` 或 `design.md`，因此本轮必须先把 roadmap sprint notes 转成可审批、可执行的 `spec.md`，再回到交付流程。

## Background & Motivation

Phase 2 Sprint 1-3 已经把 Character Library 交付为 `features.react.panels.characterLibrary` 控制的 workspace panel island，保留同一工作区入口、legacy fallback、受保护 DOM 选择器和 TanStack Query/Form/Zod/Virtual 的 React-owned 边界。

用户现在要继续 Phase 2 后半段：World Info、Backgrounds、Extensions。当前 roadmap 和代码事实显示这三块仍由 legacy 模块拥有，且 World Info prompt 激活、regex、slash command、background slash commands、extension mount points、`@sillytavern/*`、`eventSource` / `event_types` 都是高风险兼容面。用户的真实目标是推进 React 现代化，而不是在一个 sprint 中重写所有内部协议或破坏已记录的 extension/workspace 兼容边界。

## Intent Domains

### Domain: World Info editor/import React island

- **User expectation:** Sprint 4-5 应继续推进 World Info 面板 React 化，用户从同一 workspace drawer 进入，能够看到更现代的宿主、工具栏、编辑/导入反馈；flag 关闭或 bundle 缺失时继续使用 legacy World Info 面板。
- **Current status:** guarded readiness host implemented and validated; World Info behavior remains legacy-owned until a later panel-specific migration proves activation, import, regex, prompt, and deletion behavior.
- **Change history:**
  - 2026-06-18: 用户通过持久目标要求继续 `$delivery-workflow` 执行 Sprint 4 和 Sprint 5。
  - 2026-06-18: 规格准备阶段确认现有 sprint note 缺少 approved `spec.md`，且 full rewrite 与当前 ADR/roadmap 的 guarded island 边界冲突风险较高。
  - 2026-06-18: delivery workflow 已进入 implementation 阶段；当前已落地 workspace panel flags、shared bundle scaffold 和 fail-closed bridge helper，但完整 World Info 行为迁移尚未完成。
  - 2026-06-18: 文档同步确认当前代码已在 legacy replay hook 中创建独立 World Info React host，并把 global selector、editor selector、import busy、drop target readiness 传入 shared workspace-panel bundle；实际 World Info action chain 仍未迁移。
- **Implementation traceability:** implemented status-host code paths `default/config.yaml`, `src/workspace-react-features.js`, `public/script.js`, `public/scripts/workspace-panels-react-bridge.js`, `app/workspace-panels.tsx`, `vite.config.ts`, `tests/workspace-react-panel-flags.test.js`, `tests/react-workspace-panels-helpers.test.js`; legacy behavior owners remain `public/scripts/world-info.js`, `public/scripts/world-info-converters.js`, and `public/scripts/world-info-import-results.js`; docs `.docs/db/features/world-info-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/react-modernization-roadmap.md`; delivery status `status host implemented and validation/review passed; full World Info behavior migration pending`.

### Domain: Background Library React island

- **User expectation:** Sprint 6 应把背景库面板推进到 React workspace panel island；用户仍从原 workspace 入口打开背景面板，上传、删除、重命名、选择背景、刷新和 loading/catch-up 行为不能倒退。
- **Current status:** guarded host/status bridge implemented and validated; background actions remain legacy-owned until a later panel-specific migration proves upload, delete, rename, selection, lock, and slash-command behavior.
- **Change history:**
  - 2026-06-18: 用户通过持久目标要求继续 `$delivery-workflow` 执行 Sprint 6。
  - 2026-06-18: 规格准备阶段确认 `public/scripts/background-panel-controller.js` 已是现有加载状态控制边界，应复用而不是重写背景行为链路。
  - 2026-06-18: delivery workflow 已进入 implementation 阶段；当前已落地 shared workspace panel scaffold，Background Library 的用户行为仍由 legacy 背景模块和 controller 拥有。
  - 2026-06-18: 文档同步确认当前代码已在 `#Backgrounds` 内创建独立 React host，监听 `emberdesk:background-library-state-change`，并显示 loading、empty/success、global/chat gallery count 状态；上传、删除、重命名、选择、lock 和 slash-command 行为仍由 legacy 背景模块拥有。
- **Implementation traceability:** implemented status-host code paths `default/config.yaml`, `src/workspace-react-features.js`, `public/script.js`, `public/scripts/backgrounds.js`, `public/scripts/background-panel-controller.js`, `public/scripts/workspace-panels-react-bridge.js`, `app/workspace-panels.tsx`, `vite.config.ts`, `tests/react-workspace-panels-helpers.test.js`; legacy behavior owners remain `public/scripts/backgrounds.js`, `public/scripts/background-panel-controller.js`, and `src/endpoints/backgrounds.js`; docs `.docs/db/features/background-library-panel.md`, `.docs/db/pages/chat-workspace.md`; delivery status `status host implemented and validation/review passed; full Background Library behavior migration pending`.

### Domain: Extensions host React island

- **User expectation:** Sprint 7 迁移的是 Extensions drawer 宿主 UI，不是第三方扩展协议或每个扩展的内部 UI；`#extensions_settings`、`#extensions_settings2`、`#regex_container`、`#extensionsMenuButton`、`#extensionsMenu` 必须保持可挂载、可测试、可回退。
- **Current status:** guarded protected-mount-point host/status bridge implemented and validated; extension protocols remain legacy-owned until a later host migration proves discovery, mounting, menu, regex, and install/update/delete behavior.
- **Change history:**
  - 2026-06-18: 用户通过持久目标要求继续 `$delivery-workflow` 执行 Sprint 7。
  - 2026-06-18: 规格准备阶段确认 `.docs/tech/third-party-extension-compatibility.md` 是 Extensions 宿主迁移的强约束来源。
  - 2026-06-18: delivery workflow 已进入 implementation 阶段；当前已落地 shared workspace panel scaffold，Extensions mount points 和第三方扩展协议仍是 legacy 兼容 owner。
  - 2026-06-19: Task 5 implementation wired an independent Extensions Host React host under `#rm_extensions_block`, listened for `emberdesk:extensions-host-state-change`, and rendered protected mount-point / Extras API / loader state rows while keeping `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, and `#extensionsMenu` legacy-owned.
- **Implementation traceability:** implemented status-host code paths `default/config.yaml`, `src/workspace-react-features.js`, `public/script.js`, `public/scripts/extensions.js`, `public/scripts/workspace-panels-react-bridge.js`, `app/workspace-panels.tsx`, `vite.config.ts`, `tests/react-workspace-panels-helpers.test.js`, `tests/third-party-extension-compatibility.test.js`; protected legacy owners remain `public/index.html`, `public/scripts/extensions.js`, `public/scripts/templates/wandButton.html`, `public/scripts/templates/wandMenu.html`, and `src/endpoints/extensions.js`; docs `.docs/db/features/extension-panel-open.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/third-party-extension-compatibility.md`; delivery status `status host implemented and validation/review passed; full Extensions host behavior migration pending`.

### Domain: TanStack adoption and legacy ownership clarity

- **User expectation:** 后续 React 面板仍要严格推动 TanStack Query / TanStack Form / Zod；如果某个控制仍由 legacy 拥有，必须在规格和实现中写清楚边界，而不是声称 React 已接管。
- **Current status:** TanStack Query provider shell is present in the shared workspace-panel bundle; panel-specific TanStack Form / Zod adoption is still pending until React owns real input or submission controls
- **Change history:**
  - 2026-06-16: 用户要求路线图严格推动 TanStack Form/Query/Zod。
  - 2026-06-18: Phase 2 Sprint 1-3 已把该要求应用到 Character Library；Sprint 4-7 继续沿用同一规则。
  - 2026-06-18: shared workspace panel scaffold 已使用 TanStack Query provider shell；后续 panel-specific React controls 仍需按路线图补齐 TanStack Form / Zod 或明确 legacy-owned 例外。
  - 2026-06-19: 当前 World Info / Background Library / Extensions Host React surface 只呈现 readiness/status rows，不拥有可提交表单；因此 TanStack Form / Zod 的缺口保留到真正迁移 toolbar、editor、import 或 install/update controls 的后续 spec。
- **Implementation traceability:** implemented shell code paths `package.json`, `app/workspace-panels.tsx`, `public/scripts/workspace-panels-react-bridge.js`, tests covering TanStack imports and legacy-owned ledgers; docs `.docs/tech/react-modernization-roadmap.md`, `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`; delivery status `Query shell implemented, form/schema adoption pending real React-owned controls`.

## Non-Goals

- 本轮不把 chat workspace 改成全站 SPA。
- 本轮不迁移 World Info prompt 激活、token budget、regex engine、slash-command parser 或第三方 extension API。
- 本轮不改变 `/api/worldinfo/*`、`/api/backgrounds/*`、`/api/extensions/*` 的请求/响应契约。
- 本轮不移除 legacy panel fallback，不删除受保护 DOM mount points，不重写第三方扩展内部 UI。
- 本轮不引入 Hono、Zustand、Drizzle、TanStack Start、shadcn/ui 或 Ant Design；这些不是当前已采用依赖。

## Source Evidence

- `.docs/specs/react-phase2-sidebars/phase2-sprint4-world-info-editor.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint5-world-info-import.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint6-background-library.md`
- `.docs/specs/react-phase2-sidebars/phase2-sprint7-extensions-host.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/features/world-info-panel.md`
- `.docs/db/features/background-library-panel.md`
- `.docs/db/features/extension-panel-open.md`
- `.docs/db/pages/chat-workspace.md`
- `public/scripts/world-info.js`
- `public/scripts/backgrounds.js`
- `public/scripts/background-panel-controller.js`
- `public/scripts/extensions.js`
- `src/workspace-react-features.js`
- `src/react-character-library-feature.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `app/character-library-panel.tsx`
- `app/workspace-panels.tsx`
