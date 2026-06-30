---
created: 2026-06-29
source: user
confirmed: true
last_updated: 2026-06-30
---

# World Info Facade Context Intent

Date: 2026-06-29

## Original Request

用户要求将架构分析中的 World Info deepening opportunity 写成独立开发设计文档。

## Context

`public/scripts/world-info.js` 当前从 `../script.js` 导入大量 shell 状态和函数，包括 settings、request headers、chat metadata、characters、events、character save/edit helpers 等。ADR-0007 已把 `world-info.js` 定义为 World Info 高风险行为的单一 compatibility facade，因此问题不是删除 facade，而是减少 facade 对巨型 shell 的反向知识。

## Intent Domains

### Domain: World Info shell-context seam

- User expectation: 让 `public/scripts/world-info.js` 保持 World Info compatibility facade 的同时，减少它对巨型 workspace shell 的反向耦合，不改变导入、删除、prompt activation 或 regex 行为。
- Current status: delivered.
- Change history:
  - 2026-06-29: 记录首个切片只抽离 shell dependency seam，不删除 facade，也不改变 `@sillytavern/scripts/world-info` 导出形状。
  - 2026-06-30: 新增 `public/scripts/world-info-shell-context.js`，由 `public/script.js` 注册默认 shell context，`public/scripts/world-info.js` 改为通过 context 访问 settings/request/event/chat/character 能力。
  - 2026-06-30: `tests/world-info-shell-context.test.js` 固定了未注册 context 时的 fail-closed 边界，现有 import/delete/rendering focused proofs 保持绿色。
  - 2026-06-30: 浏览器验证后加固 context：`extensionPromptRoles` 改为 lazy getter 以避免启动 TDZ，`getWorldInfoShellEventSourceProperty()` 绑定 `eventSource` 方法，验证启动可完成且锁定 Character Management 后打开 World Info 时两者同时可见。
- Implementation traceability:
  - Code paths: `public/scripts/world-info-shell-context.js`, `public/scripts/world-info.js`, `public/script.js`.
  - Tests: `tests/world-info-shell-context.test.js`, `tests/world-info-card-rendering.test.js`, `tests/world-info-import-feedback.test.js`, `tests/world-info-converters.test.js`, `tests/worldinfo-delete-cascade.test.js`, `tests/react-workspace-panels-helpers.test.js`.
  - Owning docs: `.docs/tech/world-info-shell-context.md`, `.docs/logic-description/world_info_shell_context_processing_flow.md`, `.docs/tech/react-modernization-roadmap.md`, `.docs/PROJECT_HISTORY.md`.
  - Commit / PR trace: archived in the current wrap-up commit.
  - Delivery status: delivered; facade retained, direct `../script.js` import removed.

## Constraints

- `world-info.js` 仍是 World Info compatibility facade。
- 不改 `/api/worldinfo/*` payload shape。
- 不改变 `@sillytavern/scripts/world-info` 的 public export shape。
- 不改变 regex placement、prompt activation、character-book import 或 delete-cascade 行为。

## Evidence Trail

- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/react-modernization-roadmap.md`
- `public/script.js`
- `public/scripts/world-info.js`
- `public/scripts/world-info-converters.js`
- `tests/world-info-card-rendering.test.js`
- `tests/world-info-import-feedback.test.js`
- `tests/world-info-converters.test.js`
- `tests/worldinfo-delete-cascade.test.js`
- `tests/third-party-extension-compatibility.test.js`

## Change History

- 2026-06-29: 创建 World Info facade context spec 的用户意图记录。
- 2026-06-30: 追加实现追溯，记录 World Info shell-context seam 已交付。
- 2026-06-30: 追加启动顺序和 `eventSource` binding 加固追溯，记录浏览器验证结果进入 durable docs。
