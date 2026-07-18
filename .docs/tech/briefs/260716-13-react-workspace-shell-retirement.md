---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-workspace-shell-retirement
status: active
active_process_dir: .docs/specs/260716-13-react-workspace-shell-retirement
---

# React Workspace Shell Retirement Intent

## 原始请求

用户要求 Workspace Shell 最后处理，在所有依赖 surface 已接管后删除 legacy chrome、drawer coordination 与 same-version fallback。

## 目标结果

当前 `/` 只运行 React shell/chrome/navigation/layout/dock；panels 与 Main Chat 直接接入 React shell，legacy `openWorkspaceShellDrawer()` adapters、takeover/strict flags、legacy chrome 和 fallback 删除。

## Checkpoint A

- **目标结果**：用户保留同一 `/` workspace、navigation 和 panel open/close/pin 行为，但 shell 只有一个 React owner。
- **当前状态**：React chrome 仍调用 `public/script.js` adapters 打开 legacy drawers，并通过 transient dock/compatibility bridge观察结果。
- **假设**：未迁移且不属于本 program 的 child surface 可以通过明确 mount slot 接入 React shell，但不得拥有 shell navigation/layout。
- **硬约束**：不建立 `/workspace-next`，保留 extension reachability、mobile/accessibility、startup/error/local status 和 same entry。
- **风险边界**：panel lifecycle、pinned/locked semantics、startup ordering、mobile composer overlap、extension slots。
- **未决问题**：无。
- **推荐默认**：React shell registry 直接路由 React pages/panels；必要的未迁移 child content 使用受限 slot；最后删除 legacy chrome与 adapters。

## 范围边界

- 包含 root shell、navigation、dock/pin/open/close、layout/status、startup ownership、flags/adapters/chrome 删除。
- 不扩大重写未迁移 child feature 内部行为，不新增 route 或 full SPA backend。

## 变更历史

- 2026-07-16：创建 final-wave Workspace Shell retirement 包。

## 参考资料

- `app/workspace-panels.tsx`
- `app/stores/workspace-panel-store.js`
- `app/compat/global-compatibility-bridge.js`
- `public/script.js`
- `src/workspace-react-features.js`
- `tests/workspace-shell-panel-navigation.e2e.js`
- `.docs/db/features/next-workspace-shell.md`
