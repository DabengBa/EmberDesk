---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-17
feature_slug: react-background-library-retirement
status: delivered
---

# React Background Library Retirement Intent

## 原始请求

用户要求 Background Library 在已有 React gallery/actions 基础上完成行为接管并删除 legacy。

## 目标结果

React 独立拥有背景 catalog、filter/sort、selection、lock、folders、upload/rename/delete、thumbnail、chat/global background 和 slash-compatible outcomes；legacy gallery/DOM controller/flag/fallback 删除。

## Checkpoint A

- **目标结果**：用户从同一入口完成所有背景工作流，`/lockbg`、`/unlockbg`、`/autobg` 结果不变。
- **当前状态**：React 有 gallery/action host，但行为通过 `public/scripts/backgrounds.js` 和 legacy DOM/controller 执行。
- **假设**：背景 API、managed media/file authority、settings metadata 与 URL 保持。
- **硬约束**：保留 global/chat folders、selection/lock side effects、lazy thumbnail、upload persistence、group selection 和 slash commands。
- **风险边界**：选择看似成功但 settings 未保存、lock metadata 与 gallery 状态分离、删除后 URL/thumbnail 陈旧。
- **未决问题**：无。
- **推荐默认**：抽出 background catalog/action service，React 直接调用；slash command adapter 调用同一 service，最后删除 legacy DOM owner。

## 范围边界

- 包含完整 Background Library 行为与 legacy 退休。
- 不改变文件格式、background endpoints、managed media authority 或 slash command names。

## 变更历史

- 2026-07-16：创建 Background Library sole-owner 实现包。

## 参考资料

- `app/workspace-panels.tsx`
- `public/scripts/backgrounds.js`
- `public/scripts/background-panel-controller.js`
- `tests/background-panel-controller.test.js`
- `tests/background-action-persistence.e2e.js`
- `.docs/db/features/background-library-panel.md`

## Closeout

- **Status**: delivered (2026-07-17)
- **Sole owner**: React Background Library panel on the same workspace Backgrounds entry
- **Service**: `public/scripts/background-domain.js`, `public/scripts/background-library-service.js`
- **Barrel**: `public/scripts/backgrounds.js` (slash + transport helpers)
- **Owning docs**: `.docs/db/features/background-library-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/legacy-cutover-ledger.md`, `.docs/PROJECT_HISTORY.md`
- **ADR**: `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
