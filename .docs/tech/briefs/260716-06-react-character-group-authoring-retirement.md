---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-character-group-authoring-retirement
status: delivered
---

# React Character And Group Authoring Retirement Intent

## 原始请求

用户要求已迁移的 Character/Group Authoring 保持完整能力与行为，同时彻底替换 legacy form 和保存路径。

## 目标结果

React 独立拥有 character 与 group 的 create/edit/delete/draft/save 流程，覆盖 legacy 表单所有用户可访问字段；保存直接调用明确 command/service，不再等待 DOM click 或 legacy completion。

## Checkpoint A

- **目标结果**：用户从相同右侧抽屉完成完整角色卡与群组编辑，刷新后结果一致。
- **当前状态**：已交付。React 为 sole owner；save 直接调用 `/api/characters` 与 `/api/groups`；字段 coverage 完整；product flag 与 dual-owner fallback 已退休。
- **假设**：后端 character/group route、card schema、group files 和 canonical projection 继续作为数据边界。
- **硬约束**：不丢 avatar、tags、world relation、advanced character fields、group member order、generation strategy 或现有确认/错误行为。
- **风险边界**：UI 显示保存成功但 legacy write 失败、hidden form 字段遗漏、late response 覆盖新 draft。
- **未决问题**：无。
- **推荐默认**：复用现有 character write service 与 group endpoints，建立 React command payload；所有字段先完成 coverage inventory，再删除 legacy form。

## 范围边界

- 包含 character/group full-field authoring、avatar/media、member management、save/delete/cancel、refresh reconcile。
- 不处理 Character Library 浏览实现、group chat generation 或 card schema redesign。

## 变更历史

- 2026-07-16：创建 authoring sole-owner 实现包。
- 2026-07-16：交付完成；移除 active_process_dir；稳定追溯见 group-authoring / character-library-panel / chat-workspace 与 PROJECT_HISTORY。

## 稳定追溯

- Code: `app/workspace-panels.tsx`, `public/scripts/character-authoring.js`, `public/scripts/group-authoring.js`, `public/script.js`, `src/workspace-react-features.js`
- Docs: `.docs/db/features/group-authoring.md`, `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/legacy-cutover-ledger.md`, `.docs/PROJECT_HISTORY.md`, ADR-0012

## 参考资料

- `app/workspace-panels.tsx`
- `public/scripts/character-authoring.js`
- `public/scripts/group-authoring.js`
- `public/script.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/groups.js`
- `tests/character-authoring-facade.test.js`
- `tests/group-authoring-facade.test.js`
- `tests/character-group-authoring.e2e.js`
