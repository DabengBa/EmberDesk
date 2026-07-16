---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-compatibility-contract-baseline
status: delivered
---

# React Compatibility Contract Baseline Intent

## 原始请求

用户要求保留已承诺的扩展与自动化行为，同时允许内部实现彻底重写。

## 目标结果

在删除 legacy provider 前，把 globals、events、aliases、selectors、slash、regex 和扩展挂载行为变成可执行的跨 surface 验证基线，使后续 spec 能证明“替换实现而不缩水”。

## 最终稳定追溯

- Manifest: `tests/helpers/frontend-compatibility-contract.js`
- Static gate: `tests/third-party-extension-compatibility.test.js` via `bun run test:compat`
- Runtime gate: `tests/third-party-extension-runtime.e2e.js`
- Bridge exclusion: `tests/global-compatibility-bridge.test.js`, `app/compat/global-compatibility-bridge.js`
- Owning docs: `.docs/tech/third-party-extension-compatibility.md`, `.docs/tech/legacy-cutover-ledger.md`, semantic docs for shared library / extension / character / message / workspace

## 范围边界

- 包含 extension mount、imports、events、slash/regex、character/message DOM 和 bridge 非公开性。
- 不实现任何 panel、chat 或 shell retirement。
- 不把 bundled extension 源码改造成 EmberDesk API。

## 变更历史

- 2026-07-16：创建跨 surface 兼容证明基线。
- 2026-07-16：交付 executable contract baseline 与 runtime proof，并关闭 wrap-up。
