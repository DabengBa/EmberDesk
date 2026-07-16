---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-character-library-retirement
status: delivered
---

# React Character Library Retirement Intent

## 原始请求

用户要求在已迁移 React 的 Character Library 中保持行为与扩展契约，同时彻底删除 legacy 实现。

## 目标结果

React 独立拥有角色/群组列表查询、过滤、排序、tag、选择、bulk 与删除后的 reconcile；受保护 row identity 由 React 输出；legacy list renderer、dual-owner host 和 flag fallback 删除。

## 最终稳定追溯

- Owning docs: `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/legacy-cutover-ledger.md`, `.docs/tech/third-party-extension-compatibility.md`
- ADR: `.docs/adr/0012-react-migrated-surface-legacy-retirement.md` (sole-owner retirement policy); ADR-0007 partially superseded for retired surfaces
- Code: `app/character-library-panel.tsx`, `app/components/character-library/*`, `app/lib/character-library-row-helpers.ts`, `public/script.js`, `public/scripts/character-library-query-helpers.js`, `src/react-character-library-feature.js`
- Proof: `tests/character-library-*.test.js`, `tests/character-list-structure.test.js`, `tests/third-party-extension-compatibility.test.js`, `tests/character-group-authoring.e2e.js`, `tests/welcome-screen-character-management.e2e.js`
- History: `.docs/PROJECT_HISTORY.md` entry “React Character Library sole owner” (2026-07-16)

## 变更历史

- 2026-07-16：创建 Character Library sole-owner 实现包。
- 2026-07-16：交付 sole-owner cutover；列表/rows React 独占，兼容 selectors 保留，flag/legacy list fallback 删除。
