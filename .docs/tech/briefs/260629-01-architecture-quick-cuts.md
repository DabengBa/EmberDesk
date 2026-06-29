---
created: 2026-06-29
source: user
confirmed: true
last_updated: 2026-06-30
---

# Architecture Quick Cuts Intent

Date: 2026-06-29

## Original Request

用户在一次架构分析后要求：“Quick Cuts单独写一个spec, 其余5项编写5个spec开发设计文档”。

## Context

本 quick cuts 切片来自 2026-06-29 的 `improve-codebase-architecture` 分析。分析结论把 quick cuts 与真正的架构深化分开：quick cuts 只能删除、收敛或缩小浅包装和低风险死代码，不能借 cleanup 改变 React island、Express、derived cache 或第三方兼容面的架构决策。

## Intent Domains

### Domain: low-risk architecture quick cuts

- User expectation: 先做可证明安全的低风险架构 quick cuts，不把 cleanup 扩大成新的迁移计划或行为改写。
- Current status: delivered.
- Change history:
  - 2026-06-29: 记录 quick cuts 只允许删除零调用 deprecated helper、共享重复 resolver、保留 Webpack fallback 的实施边界。
  - 2026-06-30: 新增 `src/react-feature-flags.js` 统一 React page/panel flag 解析，保留现有导出名、配置 key 和默认值。
  - 2026-06-30: 从 `src/util.js` 删除 repo 内零调用的 deprecated `setConfigValue()` 和 `makeHttp2Request()`，同时保留 `/lib.js` Webpack fallback 路径不变。
- Implementation traceability:
  - Code paths: `src/react-feature-flags.js`, `src/react-login-feature.js`, `src/react-setup-feature.js`, `src/react-settings-feature.js`, `src/react-character-library-feature.js`, `src/workspace-react-features.js`, `src/util.js`.
  - Tests: `tests/workspace-react-panel-flags.test.js`, `tests/character-library-react-panel-flag.test.js`, `tests/user-storage-config.test.js`, `tests/util.test.js`, `tests/util-pure.test.js`.
  - Owning docs: `.docs/tech/react-modernization-roadmap.md`, `.docs/tech/config-resolution.md`, `.docs/PROJECT_HISTORY.md`.
  - Commit / PR trace: archived in the current wrap-up commit.
  - Delivery status: delivered without changing feature-flag semantics or Webpack fallback policy.

## Candidate Domains

1. React feature flag wrapper：`src/react-login-feature.js`、`src/react-setup-feature.js`、`src/react-settings-feature.js`、`src/react-character-library-feature.js` 与 `src/workspace-react-features.js`。
2. Deprecated util helpers：`src/util.js` 中已标记 deprecated 的 `setConfigValue()` 和 `makeHttp2Request()`。
3. Webpack fallback：ADR-0006 仍保留 deprecated fallback / Docker precompile path，本切片只允许建立退出条件，不删除 fallback。

## Constraints

- 不改变任何 feature flag 默认值、配置 key、route fallback 或 bundle-missing 行为。
- 不删除 ADR-0006 仍承认的 Webpack fallback。
- 不把 quick cuts 扩大成 `src/util.js` 机械拆分或 React workspace 架构重做。
- 删除前必须有 `rg` 调用图或测试证明；无法证明零调用或等价替代时不删除。

## Evidence Trail

- `.docs/adr/0006-preserve-dual-libjs-source-and-bundled-boundary.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/config-resolution.md`
- `src/react-login-feature.js`
- `src/react-setup-feature.js`
- `src/react-settings-feature.js`
- `src/react-character-library-feature.js`
- `src/workspace-react-features.js`
- `src/util.js`
- `tests/workspace-react-panel-flags.test.js`
- `tests/character-library-react-panel-flag.test.js`
- `tests/user-storage-config.test.js`
- `tests/util.test.js`
- `tests/util-pure.test.js`

## Change History

- 2026-06-29: 创建 quick cuts spec 的用户意图记录。
- 2026-06-30: 追加实现追溯，记录 shared flag resolver 和 deprecated helper 删除已交付。
