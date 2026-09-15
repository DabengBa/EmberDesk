---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-09-15
feature_slug: react-background-library-retirement
status: retired
---

# React Background Library Retirement Intent

> Current status (2026-09-15): The Background Library management surface is retired. Removed: the management UI, React/legacy hosts, feature flag, management routes and redirects, and management-only commands. Preserved: background URL/render/settings compatibility, `/backgrounds/*`, historical/default assets, canonical managed-media lifecycle including shadow import, folder repair/import, and tombstones, generic media metadata, inline chat images, and canonical chat attachments.

## 原始请求（历史）

用户要求 Background Library 在已有 React gallery/actions 基础上完成行为接管并删除 legacy。

## 目标结果（历史，已被 2026-09-15 退休边界取代）

React 独立拥有背景 catalog、filter/sort、selection、lock、folders、upload/rename/delete、thumbnail、chat/global background 和 slash-compatible outcomes；legacy gallery/DOM controller/flag/fallback 删除。

## Checkpoint A（历史）

- **目标结果**：用户从同一入口完成所有背景工作流，`/lockbg`、`/unlockbg`、`/autobg` 结果不变。
- **当前状态**：React 有 gallery/action host，但行为通过 `public/scripts/backgrounds.js` 和 legacy DOM/controller 执行。
- **假设**：背景 API、managed media/file authority、settings metadata 与 URL 保持。
- **硬约束**：保留 global/chat folders、selection/lock side effects、lazy thumbnail、upload persistence、group selection 和 slash commands。
- **风险边界**：选择看似成功但 settings 未保存、lock metadata 与 gallery 状态分离、删除后 URL/thumbnail 陈旧。
- **未决问题**：无。
- **推荐默认**：抽出 background catalog/action service，React 直接调用；slash command adapter 调用同一 service，最后删除 legacy DOM owner。

## 范围边界（历史实现范围与当前移除/保留边界）

- **历史实现范围（2026-07-16）**：本 brief 原计划包含完整 Background Library 行为与 legacy 退休，并假设不改变文件格式、background endpoints、managed media authority 或 slash command names。以上只记录当时意图，不是当前管理面契约。
- **当前保留**：背景 URL/render/settings reads、`/backgrounds/*`、历史/默认背景 assets、canonical media owners/tombstones/folder repair/import、inline chat images 和 canonical chat attachments；`/bg` 仅作为直接 name/path/custom-URL setter 保留，不依赖 Background Library catalog。
- **当前移除**：Background Library CRUD/folders/management API、redirects、React/legacy management UI 及管理命令 `/lockbg`、`/unlockbg`、`/autobg`。这些管理命令与保留的 `/bg` 直接 setter 不同。

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

- **Status**: management surface retired (2026-09-15)
- **Removed**: Background Library React/legacy UI hosts, management flag, CRUD/folder-management routes and redirects, management bridge/controller, and `/lockbg`, `/unlockbg`, `/autobg` commands.
- **Preserved**: background URL/render/settings reads, `/backgrounds/*`, historical/default assets, canonical managed-media ownership including shadow import, tombstones, folder repair/import, generic image metadata, inline chat images, and canonical chat attachments.
- **Owning docs**: `.docs/db/features/background-library-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/legacy-cutover-ledger.md`, `.docs/PROJECT_HISTORY.md`
- **ADR**: `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
