---
created: 2026-07-21
source: user
confirmed: true
last_updated: 2026-07-21
feature_slug: group-chat-retirement
status: delivered
---

# Group Chat Retirement Intent

## 原始请求

用户先要求调研彻底剔除「群聊」功能；确认产品方向为：**不再支持多角色会话**。随后授权 `$brainstorming` 产出可交付的实现 `spec.md` 与执行 `plan.md`。

## 目标结果

EmberDesk 产品仅支持单角色（及 assistant/临时）会话。用户不能再创建、打开、编辑、生成或管理 group chat；工作区不再把 group 当作一等会话实体。旧 `groups/` 与 `group chats/` 数据默认保留在磁盘上且不被自动 purge；过时客户端调用群相关 API 时得到稳定、可机读的退役响应，而不是半残功能或 HTML 404。

## Checkpoint A

- **目标结果**：产品层与运行时层不再支持多角色 group 会话；单聊路径保持可用且无 group 入口/分支劫持。
- **当前状态**：群聊是完整并行栈：`public/scripts/group-chats.js`（~2.5k LOC）驱动 `selected_group` / `generateGroupWrapper`；`src/endpoints/groups.js` 与 `src/endpoints/chats.js` 的 `is_group` / `/group/*` 提供 CRUD 与会话 IO；React shell 注册 `Group Chats` / `groupAuthoring`；角色库混合渲染 `CharacterLibraryGroupRow`（`.group_select` / `data-grid`）；canonical chat 以 `owner_type='group'` 投影；slash `/member-*`、macros `{{group}}`、多个内置扩展与 `st-context.groupId` 均耦合。
- **假设**：
  1. 「不再支持多角色会话」= 删除/退役 group session 产品能力，不是仅藏 UI。
  2. 现网或本地用户目录里可能已有 group 定义与 jsonl；本切片默认 **不自动删除** 这些文件（对齐 built-in vector retirement）。
  3. 第三方扩展可能读取 `context.groupId` / `context.groups`；字段可保留为稳定空值，而不是直接删属性。
  4. World Info 的 inclusion `group` / group scoring **不属于**本退役范围。
  5. 首个可交付切片以「用户无法再进入群聊 + 生成/API 硬退役」为完成线；物理清盘与 canonical schema 去 `group` 可后置。
- **硬约束**：
  - 单角色 chat 的打开、生成、保存、导入导出、搜索/recent、书签（非 convert-to-group）不得回归。
  - 不破坏受保护扩展表面的最小契约：`eventSource`、`event_types`、`globalThis.SillyTavern`、`@sillytavern/*`；`groupId` 等字段允许恒为 `null` / 空数组。
  - 有意更新兼容契约时，必须同步改 AGENTS / third-party-extension-compatibility / `frontend-compatibility-contract` 中的 `.group_select` 保护项，禁止静默删 DOM 却留契约。
  - 不引入长期「群聊功能开关」；退役后无 product flag 可重新打开 group 会话。
  - 保持无关脏工作区文件；不修改 `release` 分支直接落地策略以外的运维动作。
- **风险边界**：
  - `public/script.js` 中 `Generate` / stop / swipe 与 `is_group_generating` 缠绕，误删可导致单聊卡死或双发。
  - `saveChat` 对 group 有 throw 护栏；半删会让保存路径混乱。
  - Canonical query/recent 仍扫 `groups`/`groupChats`；若只断 UI 不断 query，会出现幽灵 recent。
  - 角色库与 bulk-edit 依赖 `.group_select`；删行必须更新兼容测试。
  - `active_group` 启动恢复（`RossAscends-mods.js`）会在 refresh 后重新打开 group。
- **未决问题**：无阻塞项。默认采用与 vector retirement 相同的「删除实现 + 稳定 JSON 410 tombstone + 保留磁盘数据」策略；物理 purge 与 SQLite `owner_type` 收缩作为后续切片。
- **推荐默认（首个可交付切片）**：
  1. 去掉全部用户可见 group 入口与 group 实体列表。
  2. 启动/恢复永不 `openGroupById`；`selected_group` / `active_group` 强制清空。
  3. 生成路径不再进入 `generateGroupWrapper`；若仍被调用则明确失败。
  4. `/api/groups/*` 与 chats 的 group 专用写路径改为稳定 JSON `410`（或等价退役语义），不读写用户 group 文件。
  5. 精简 shell/authoring/slash 的 group 产品表面；`st-context` 保留空值兼容。
  6. 更新语义文档与兼容契约；单聊回归证明为门禁。
  7. **不做**：自动 `rm -rf` 用户 `groups/` / `group chats/`；不做 World Info group 字段清理；不做全量 locale 清扫优先。

## 范围边界

### 包含（本 feature 包）

- 产品与运行时退役：UI 入口、角色库 group 行、React Group Authoring / Group Chats shell 项、group 生成、group 会话打开/保存写路径、group slash 产品命令、settings 中仅服务群聊的可见开关文案/控件（若仍承诺能力）。
- API 退役 tombstone：`/api/groups/*`；chats 侧 group 专用端点与 `is_group` 写路径的退役语义。
- 兼容：`context.groupId` 恒空、兼容契约有意更新、文档与 Doc ID 更新。
- 验证：单聊主路径 + 退役响应 + 无 group 入口的自动化/手工证明。

### 不包含 / 后置

- 用户数据物理删除、备份导出工具、运营一键 purge。
- Canonical SQLite 删除 `owner_type='group'` 列值/schema 收缩（可只停止新写入并忽略读侧 group 会话）。
- World Info inclusion group、bulk-edit overlay 类名中的 “group” 用词。
- 第三方扩展仓库本体改造（只保证宿主侧空值与 410）。
- `talkativeness` 角色字段存储格式变更（可隐藏仅群相关 UI 提示；字段 round-trip 可保留）。

## 与既有 brief 的关系

- `260716-06-react-character-group-authoring-retirement`：**已交付**，方向是 React 独占 group **作者**表单，不是删除群聊产品。本 brief **取代**「继续维护 group authoring 为产品能力」的隐含前提；不回溯否定该交付的历史事实。
- `260715-01-built-in-vector-retirement`：退役手法参考（删实现 + JSON 410 + 保留旧数据 + 无长期功能门）。
- 无 ADR 要求「必须保留群聊」；`ADR-0007` 仅将 group 生成路径列为当时 transport 冻结事实，可随本退役一并收敛。

## 变更历史

- 2026-07-21：用户确认产品不再支持多角色会话；授权 brainstorming 产出实现规格与执行计划。调研结论见会话内只读盘点（~80 强信号文件；主中枢 `group-chats.js`）。

## 参考资料

- `public/scripts/group-chats.js`
- `public/scripts/group-authoring.js`
- `public/script.js`（`selected_group` / `Generate` 分支 / `active_group`）
- `src/endpoints/groups.js`
- `src/endpoints/chats.js`（`is_group`、`/group/*`）
- `src/server-startup.js`（`/api/groups` 挂载与 deprecated redirect）
- `src/endpoints/vector-retirement.js`（410 模式）
- `app/workspace-panels.tsx`、`app/stores/workspace-panel-store.js`
- `app/components/character-library/CharacterLibraryGroupRow.tsx`
- `public/scripts/st-context.js`
- `public/scripts/slash-commands.js`
- `tests/helpers/frontend-compatibility-contract.js`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/features/group-authoring.md`
- `.docs/db/features/next-workspace-shell.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/character-library-panel.md`
- `.docs/tech/briefs/260715-01-built-in-vector-retirement.md`
- `.docs/tech/briefs/260716-06-react-character-group-authoring-retirement.md`


## 稳定追溯

- Code: `src/endpoints/group-chat-retirement.js`, `src/endpoints/groups.js`, `src/endpoints/chats.js`, `public/scripts/group-chats.js`, `public/script.js`, `app/workspace-panels.tsx`, `app/stores/workspace-panel-store.js`, `app/components/character-library/`
- Docs: `.docs/db/features/group-authoring.md`, `.docs/db/pages/chat-workspace.md`, `.docs/db/features/next-workspace-shell.md`, `.docs/db/features/character-library-panel.md`, `.docs/PROJECT_HISTORY.md`
- Tests: `tests/group-chat-retirement.test.js`, `tests/groups-route-authoring.test.js`, `tests/chat-route-service.test.js`, `tests/character-group-authoring.e2e.js`
