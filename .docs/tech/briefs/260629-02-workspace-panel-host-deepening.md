---
created: 2026-06-29
source: user
confirmed: true
last_updated: 2026-06-30
---

# Workspace Panel Host Deepening Intent

Date: 2026-06-29

## Original Request

用户要求将架构分析中的 5 个 deepening opportunities 分别编写为开发设计规格。本 brief 对应 “Workspace React panel bridge 内部加深”。

## Context

当前 workspace React panel 的外部 seam `mountWorkspacePanel(kind, container, options)` 很小，但 `public/script.js` 同时负责 panel flag 检查、host container lifecycle、bridge state sampling、action dispatch、fallback、remount scheduling；`app/workspace-panels.tsx` 同时负责 Zod parsing、React shell、diagnostics、state fallback 和 store update。近期已修复的“锁定角色管理面板打开世界书后消失”问题说明 panel lifecycle 和 legacy owner 状态仍需要更强 locality。

## Intent Domains

### Domain: workspace panel host lifecycle deepening

- User expectation: 修复和预防锁定 Character Management 与 World Info/Background/Extensions/main-chat 岛之间的宿主生命周期回归，同时保持同一 workspace 入口和既有兼容表面不变。
- Current status: delivered.
- Change history:
  - 2026-06-29: 把 workspace panel host lifecycle、bridge remount 和 fallback 规则固定为单独 deepening 切片。
  - 2026-06-30: 新增 `public/scripts/workspace-panel-host-controller.js`，统一 World Info、Background Library、Extensions Host 和 `mainChatMessageList` 的 flag gate、drawer reopen、state-change resample 与 action-settle remount。
  - 2026-06-30: `tests/react-workspace-panels-helpers.test.js` 补齐共享 host seam proof，并用异步 `actionResult` 回归证明修复 `shouldRemount(false)` 仍被误重挂载的问题。
- Implementation traceability:
  - Code paths: `public/scripts/workspace-panel-host-controller.js`, `public/script.js`, `app/workspace-panels.tsx`.
  - Tests: `tests/react-workspace-panels-helpers.test.js`, `tests/workspace-react-panel-flags.test.js`, `tests/character-list-structure.test.js`.
  - Owning docs: `.docs/tech/react-modernization-roadmap.md`, `.docs/db/features/character-library-panel.md`, `.docs/PROJECT_HISTORY.md`.
  - Commit / PR trace: archived in the current wrap-up commit.
  - Delivery status: delivered as an internal seam; locked Character Management stays visible when World Info opens.

## Constraints

- 保留 ADR-0007 的 guarded React island 和 legacy fallback。
- 不引入完整 SPA workspace shell。
- 不改变 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*` 或 protected DOM selectors。
- 不改变 `mountWorkspacePanel(kind, container, options)` 的外部调用语义。

## Evidence Trail

- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/script.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `app/workspace-panels.tsx`
- `app/stores/workspace-panel-store.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/workspace-react-panel-flags.test.js`

## Change History

- 2026-06-29: 创建 workspace panel host deepening spec 的用户意图记录。
- 2026-06-30: 追加实现追溯，记录共享 host controller seam 已交付。
