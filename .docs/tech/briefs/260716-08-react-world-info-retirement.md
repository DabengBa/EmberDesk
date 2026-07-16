---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-world-info-retirement
status: delivered
---

# React World Info Retirement Intent

## 原始请求

用户要求 World Info 在已有 React workbench 基础上继续完成，实现行为等价后删除 legacy。

## 目标结果

React workbench 与 framework-neutral World Info services 独立拥有编辑、激活、scan/prompt、regex、import/export、delete 和 persistence；`world-info.js` 不再是 UI/behavior owner，仅在需要时保留薄 public export barrel。

## Checkpoint A

- **目标结果**：World Info 不再通过 hidden DOM 或 facade action 调用 legacy workbench。
- **当前状态**：React 是可见 workbench owner，但 actions、prompt activation、regex、converter/import、delete cascade 与持久化仍在 `public/scripts/world-info.js`。
- **假设**：`@sillytavern/scripts/world-info` 路径与受支持 exports 必须继续可用，可由新 service/barrel 提供。
- **硬约束**：不改变 World Info schema、canonical/file authority、scan results、regex order、import formats、delete cascade 或 `vectorized` round-trip。
- **风险边界**：拆分大模块可能破坏 startup ordering、event binding、prompt generation 和 extension imports。
- **未决问题**：无。
- **推荐默认**：按 domain 抽出 pure/service modules，React 直接调用 service；最后把 `world-info.js` 收缩为无 DOM ownership 的兼容 barrel。

## 范围边界

- 包含 UI actions、activation/editor state、scan/prompt、regex integration、import/export、delete/persistence 和 hidden DOM/fallback 删除。
- 不重做已交付 workbench 布局，不改变 API/storage/schema。

## 变更历史

- 2026-07-16：在 delivered workbench 基础上创建 full behavior-owner retirement 包。

## 参考资料

- `app/world-info-workbench.tsx`
- `public/scripts/world-info.js`
- `public/scripts/world-info-shell-context.js`
- `public/scripts/world-info-converters.js`
- `public/scripts/world-info-import-results.js`
- `tests/world-info-workbench.e2e.js`
- `.docs/db/features/world-info-panel.md`

## Closeout Trace

- Owning feature: [World Info Panel](../db/features/world-info-panel.md)
- ADR: [ADR-0012](../adr/0012-react-migrated-surface-legacy-retirement.md)
- Code: `public/scripts/world-info-domain.js`, `public/scripts/world-info-workbench-service.js`, `public/scripts/world-info.js`, `app/world-info-workbench.tsx`, `public/script.js`
- Proof: `tests/world-info-domain-service.test.js`, `tests/world-info-workbench.e2e.js`, `bun run test:compat`
- History: `.docs/PROJECT_HISTORY.md` (React World Info sole owner)
