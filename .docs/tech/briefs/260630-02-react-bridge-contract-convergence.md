---
created: 2026-06-30
source: user
confirmed: true
last_updated: 2026-06-30
---

# React Bridge Contract Convergence Intent

## Original Request

用户要求针对“最值得推进的现代化切口”进一步细分步骤，并使用 `$brainstorming` 编写多份开发设计规格。本 brief 对应切口二：“把 React owner 做成更少 bridge、更清晰 facade”。

## Context

EmberDesk 的 React page/panel islands 已交付，但 owner、fallback、diagnostic、mount result 等词汇分散在 `public` bridge、React bundle、main-chat contract 和测试中。下一步收益不是扩大 React owner，而是统一这些内部合约，降低后续 fallback 判断和诊断漂移。

## Intent Domains

### Domain: workspace bridge result contract convergence

- User expectation: 保持同一 workspace 入口、legacy fallback 和保护节点不变，同时让 React bridge 的 mounted/fallback/error 结果在代码和测试中使用同一语义。
- Recommended first slice: 抽出共享 bridge result/diagnostic contract，供 `public/scripts/workspace-panels-react-bridge.js`、`public/scripts/workspace-panel-host-controller.js` 和相关测试复用。
- Current status: delivered and archived.
- Change history:
  - 2026-06-30: 记录用户要求的 5 个现代化 successor specs，并选择本切口的最小可交付边界。
  - 2026-06-30: `$grill-with-docs` 复核后收紧为 mount result/fallback reason 合约收敛；不改 React tree/key、UI、schema 或第三方 API，并补充 React/Vite/TanStack 官方证据路径。
- Implementation traceability:
  - Code path: `public/scripts/workspace-panel-mount-contract.js` defines internal mounted/fallback result helpers and fallback reasons; `public/scripts/workspace-panels-react-bridge.js` and `public/scripts/workspace-panel-host-controller.js` consume the same contract.
  - Proof path: `tests/react-workspace-panels-helpers.test.js` covers feature-disabled, missing-container, bundle-load-failed, mount-failed, and mounted result paths; `tests/workspace-react-panel-flags.test.js` and `tests/third-party-extension-compatibility.test.js` preserve flag and compatibility gates.
  - Delivery status: delivered on 2026-06-30; no React UI/schema/tree, third-party API, protected mount point, slash-command, regex, message-rendering, or extension compatibility surface changed.

## Constraints

- 不扩大任何 React owner surface。
- 不改变 `mountWorkspacePanel(kind, container, options)` 的外部语义。
- 不把 `__emberDeskReactCompatibilityBridge` 变成第三方公开 API。
- 不移除 flag-off、build-missing、bundle-import-failure fallback。

## Evidence Trail

- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/briefs/260629-02-workspace-panel-host-deepening.md`
- `public/scripts/workspace-panels-react-bridge.js`
- `public/scripts/workspace-panel-host-controller.js`
- `app/workspace-panels.tsx`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/workspace-react-panel-flags.test.js`
