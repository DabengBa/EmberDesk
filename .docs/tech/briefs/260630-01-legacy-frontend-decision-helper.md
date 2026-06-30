---
created: 2026-06-30
source: user
confirmed: true
last_updated: 2026-06-30
---

# Legacy Frontend Decision Helper Intent

## Original Request

用户要求针对“最值得推进的现代化切口”进一步细分步骤，并使用 `$brainstorming` 编写多份开发设计规格。本 brief 对应切口一：“继续压缩 legacy 前端复杂度”。

## Context

EmberDesk 已冻结 jQuery workspace shell 作为 `/` 的长期 facade。`public/script.js` 仍承载大量工作区状态、抽屉、角色列表、主聊天和兼容导出逻辑；现代化应优先抽出可测试的纯决策 helper，而不是迁移 shell、重排 DOM 或替换事件/扩展表面。

## Intent Domains

### Domain: locked workspace drawer decision helper

- User expectation: 降低 `public/script.js` 中工作区抽屉/锁定面板状态决策的复杂度，让后续修复能先验证状态规则，再触碰 DOM。
- Recommended first slice: 抽出一个纯 helper，描述锁定 Character Management 与 World Info/Background/Extensions/main-chat panel 共存时是否保留、切换或跳过重挂载。
- Current status: delivered and archived.
- Change history:
  - 2026-06-30: 记录用户要求的 5 个现代化 successor specs，并选择本切口的最小可交付边界。
  - 2026-06-30: `$grill-with-docs` 复核后收紧为 pure function only；不新增 UI、React owner、配置或 workspace shell 迁移，并把 `public/script.js` 长期 facade 作为 Elephant 风险写入 spec。
- Implementation traceability:
  - Code path: `public/scripts/workspace-panel-host-controller.js` now exports `decideWorkspacePanelHostLifecycle(...)` for plain-data host lifecycle decisions and routes enabled host mounts through it without changing legacy fallback behavior.
  - Proof path: `tests/react-workspace-panels-helpers.test.js` covers enabled, disabled, unknown, locked, unlocked, missing-container, and no-remount outcomes; `tests/third-party-extension-compatibility.test.js` remains the protected-surface gate.
  - Delivery status: delivered on 2026-06-30; no user-visible DOM, wording, panel entry, lock behavior, extension mount, slash-command, regex, message-rendering, or compatibility export changes.

## Constraints

- 不改变 `public/script.js` 对 `eventSource`、`event_types`、`globalThis.SillyTavern` 的兼容导出。
- 不改变 message rendering、streaming、slash-command parser、regex engine 或 extension mount points。
- 不改变用户可见 DOM 结构、文案、抽屉入口或面板锁定语义。
- 必须复用 `.docs/tech/frontend-jquery-slice-migration.md` 的小切片模式。

## Evidence Trail

- `.docs/tech/frontend-jquery-slice-migration.md`
- `.docs/tech/modernization-phase1-complexity-map.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `public/script.js`
- `public/scripts/workspace-panel-host-controller.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/third-party-extension-compatibility.test.js`
