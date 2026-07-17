---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-17
feature_slug: react-extensions-host-retirement
status: delivered
---

# React Extensions Host Retirement Intent

## 原始请求

用户要求保留扩展、脚本、slash/regex、browser imports 与自动化行为，同时允许 Extensions Host 内部彻底重写并删除 legacy。

## 目标结果

React Extensions Host 独立拥有 discovery/activation、settings mounts、Manage/Install、operation feedback、Extras 和 deferred lifecycle；稳定 mount IDs 与 public imports 由 React-era host/services 提供，legacy drawer/host/facade/flag 删除。

## 交付结果

- React 为 Extensions Host 唯一可见 owner：notify/Manage/Install、Extras、loader/error/retry。
- Framework-neutral domain/service 模块拥有 deferred lifecycle、operations、Extras；`public/scripts/extensions.js` 为薄 public barrel。
- 受保护 mount slots 在 React lifecycle 下保持稳定；第三方扩展内容可不改写内部 UI。
- 产品 flag 与 dual-owner legacy host 路径已退休；缺 workspace-panels build 时 fail closed。
- JS-Slash-Runner、`@sillytavern/*`、events、slash、regex 与 operation safety 保持 freeze-supported。

## Checkpoint A（历史意图）

- **目标结果**：现有扩展无需依赖旧抽屉实现也能挂载、运行、管理和恢复。
- **假设**：第三方扩展可继续把自身 Vue/jQuery/HTML 内容挂载进兼容 slot；“React sole owner”指 host/lifecycle，不要求重写第三方扩展 UI。
- **硬约束**：JS-Slash-Runner primary gate、protected mount IDs、`@sillytavern/*`、events、slash、regex、operation safety、filesystem/Git authority 保持。

## 范围边界

- 包含 host、mount protocol、discovery/activation、Manage/Install、operation safety UI、Extras、public exports 与 legacy 退休。
- 不重写各第三方扩展内部 UI，不建立 SQLite extension registry，不改变 filesystem/Git authority。

## 变更历史

- 2026-07-16：创建 Extensions Host sole-owner 实现包，依赖 compatibility baseline。
- 2026-07-17：交付 sole owner；brief 关闭，`active_process_dir` 移除。

## 稳定追溯

- Semantic: [extension-panel-open](../../db/features/extension-panel-open.md), [chat-workspace](../../db/pages/chat-workspace.md), [shared-browser-library](../../db/terms/shared-browser-library.md)
- Ledger: [legacy-cutover-ledger](../legacy-cutover-ledger.md)
- Compat: [third-party-extension-compatibility](../third-party-extension-compatibility.md)
- History: [PROJECT_HISTORY](../../PROJECT_HISTORY.md)
- ADR: [ADR-0012](../../adr/0012-react-migrated-surface-legacy-retirement.md)
- Code: `public/scripts/extension-host-domain.js`, `public/scripts/extension-host-service.js`, `public/scripts/extension-compatibility-slots.js`, `public/scripts/extensions.js`, `public/script.js`, `app/workspace-panels.tsx`, `src/workspace-react-features.js`
- Tests: `tests/extension-host-service.test.js`, `tests/extensions-host.e2e.js`, `bun run test:compat`

## 参考资料

- `.docs/tech/third-party-extension-compatibility.md`
- `app/workspace-panels.tsx`
- `public/scripts/extensions.js`
- `src/endpoints/extensions.js`
- `src/extension-operation-safety.js`
- `tests/extension-operation-safety.test.js`
- `tests/third-party-extension-compatibility.test.js`
- `.docs/db/features/extension-panel-open.md`
