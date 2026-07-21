# 群聊（多角色会话）产品退役

## 意图与核心流程

EmberDesk **不再提供多角色 group chat**：用户只能进行单角色会话（及既有 assistant/临时会话）。创建、打开、编辑、生成、导入导出与 slash 管理群聊的产品路径全部退役；旧磁盘数据默认保留且不自动 purge。

主要参与者：已认证 workspace 用户；过时脚本/扩展若仍调用群 API 或读 `context.groupId`。

主路径（成功态）：

1. 用户登录进入 Chat Workspace（`/`）。
2. 工作区主导航与角色库中 **看不到** Group Chats 入口、创建 Group 控件、group 实体行。
3. 用户只能选择角色卡（或 assistant）打开会话；发送消息走单角色生成路径。
4. 刷新后若 settings 里曾保存 `active_group`，系统 **不会** 打开群聊，并清除该活跃 group 状态。
5. 过时客户端调用 `/api/groups/*` 或 chats 的 group 写/专用端点时，收到稳定 JSON 退役响应（推荐 `410`），且 **不修改** 用户 `groups/`、`group chats/` 文件。
6. 扩展读取 `SillyTavern.getContext().groupId` 得到 `null`（或等价空），`groups` 为空列表或只读空兼容值；单聊扩展路径仍可用。

## 范围 / 不做范围

### 本次要做

- **产品入口退役**：React shell 的 Group Chats 导航项；角色库 toolbar「Group」/ `rm_button_group_chats`；`CharacterLibraryGroupRow` 与列表中的 group 实体；右侧 `#rm_group_chats_block` / React `groupAuthoring` 作为产品表面。
- **会话选择退役**：禁止 `openGroupById` / `getGroupChat` 成为用户可达路径；`selected_group`、`active_group`、settings 持久化的 active group 在加载后强制清空且不再写回有效 group id。
- **生成退役**：`Generate` 及相关 command service 不再进入 `generateGroupWrapper` / multi-member 激活策略；若内部仍被误调，必须明确失败（toast/日志）且不产生半成品群消息流。
- **API 退役**：`/api/groups/*` 实现改为 tombstone（对齐 `src/endpoints/vector-retirement.js` 的 JSON `410` 模式）；`src/endpoints/chats.js` 中 group 专用路由（如 `/group/get|save|delete|import|info`）与依赖 `is_group=true` 的写路径返回同一退役语义，避免静默写盘。
- **命令与设置表面**：移除或改为明确“已移除”的 group-only slash（`/member-*` 等）；设置里仅服务群聊队列/修剪等可见承诺控件不再声称可用。
- **兼容壳**：`st-context` 继续导出 `groupId`/`groups`/`openGroupChat` 等符号时，行为必须是空操作或明确失败，不得打开群聊。
- **契约与文档**：更新 `feature.group_authoring`（退役说明）、`page.chat_workspace`、`feature.next_workspace_shell`、`feature.character_library_panel`；有意从兼容保护列表移除 `.group_select`（及仅服务于 group 行的断言）并同步 AGENTS / third-party 文档。
- **证明**：自动化覆盖 tombstone、无入口、单聊主路径；必要 e2e/手工 PM 检查。

### 明确不做

- 不自动删除、迁移或重写用户目录下既有 `groups/*.json` 与 `group chats/*.jsonl`。
- 不在本切片收缩 canonical SQLite schema 或强制 purge `owner_type='group'` 历史行（允许读路径忽略 group 会话、停止新写入）。
- 不改 World Info inclusion group / group scoring / `group_weight`。
- 不清理全部 locale 文案（可改用户可见英文/中文主路径文案；全量 i18n 清扫后置）。
- 不改造第三方扩展仓库；只保证宿主退役语义。
- 不引入 `features.groupChat.enabled` 之类长期开关。
- 不把 bulk-edit 的 CSS 类名 `group_overlay_mode_select` 等布局用词当作群聊功能删除。
- 不扩大到「删除角色 talkativeness 存储字段」；仅当 UI 文案明确只服务群权重时可改文案或隐藏控件，字段 round-trip 可保留。

## 边界规则 / 验收

R1: 已登录用户在 Chat Workspace 主 shell 导航中 **不能** 看到或激活 `Group Chats` / `openGroupChats` 产品入口；不存在可打开的 Group Authoring 产品表面（无 `#rm_group_chats_block` 作为可用编辑器，无 React `groupAuthoring` 可保存群定义）。

R2: 角色库列表 **只** 呈现 character（及既有 folder/tag 等非 group 实体）；不渲染 `.group_select` 行，不提供「Create New Chat Group」类控件；选择任一可见角色仍可打开单聊。

R3: 启动、刷新或读取 settings 中的 `active_group` **不会** 调用成功的群打开路径；工作结束后 `selected_group` / 等效状态为 empty，`active_group` 不保持有效 group id。

R4: 在单角色会话中发送消息、regenerate、swipe（若产品仍支持）、stop 均走单聊路径；代码路径不得进入多成员 `generateGroupWrapper` 成功态；`is_group_generating` 不得卡住单聊发送键。

R5: `POST /api/groups/all|create|edit|delete`（及挂载前缀下未列子路径）返回稳定 JSON 退役响应：HTTP `410`，body 含稳定 `error` 码（如 `group_chat_feature_removed`）与可读 `message`；**不创建/不修改/不删除** 用户 `groups/` 与 `group chats/` 下既有文件（delete tombstone 也不删盘）。

R6: chats 的 group 专用端点（至少 `/api/chats/group/get`、`/save`、`/delete`、`/import`，以及实现中仍暴露的 group 变体）与 `is_group=true` 的写/重命名/导出写路径：要么 `410` 退役，要么在只读探测场景下不产生新 group 权威写入；不得在退役后仍成功 `save` 新的 group jsonl 权威会话。

R7: 用户可见 slash 中，群成员管理类命令（如 `/member-add|remove|enable|disable|up|down|count|get` 及仅群可用的打开群路径）不可再成功变更群状态；执行时给出明确“已移除/不可用”反馈，且不影响单聊 slash 基线。

R8: `globalThis.SillyTavern.getContext()`（或现行等价）在任意时刻 `groupId` 为 `null`/empty；若仍暴露 `groups`，则为空数组或不再承载可打开会话；`openGroupChat`（若保留导出）不得打开群会话。

R9: 兼容契约与文档一致：`tests/helpers/frontend-compatibility-contract.js`、`.docs/tech/third-party-extension-compatibility.md`、根 `AGENTS.md` 不再要求保留 `.group_select` 作为产品保护行；`bun run test:compat` 与相关 character-list 结构测试在新契约下通过。

R10: 语义文档反映退役：`feature.group_authoring` 标记为 retired/不再作为用户工作流；`page.chat_workspace`、`feature.next_workspace_shell`、`feature.character_library_panel` 的导航与列表合同不再承诺 Group Chats / 混合 group 行；`bun run docs:check` 通过。

R11: 单聊回归：打开角色 → 发送至少一条用户消息并收到/完成一条助手生成（可用 mock/offline 测试双路径中项目既有方式）→ 刷新后会话仍可打开；chat search/recent 的 **角色** 路径不因 group 退役而 500。

R12: 若仓库仍包含仅用于群聊的设置项（如 `show_group_chat_queue`）作为 **可见承诺**，则隐藏或标注不可用，避免用户以为群队列仍存在；纯死配置键可留在 settings JSON 一轮兼容，不得驱动 UI 行为。

## 架构 / 约束

- **退役模式**：复用 built-in vector retirement：删除/掏空第一方实现 + 路由层 JSON `410` tombstone + 磁盘数据保留 + 无长期 feature flag。参考 `src/endpoints/vector-retirement.js` 与 `tests/vector-retirement.test.js`。
- **前端中枢**：以消除用户可达的 `selected_group` 真值与 `generateGroupWrapper` 成功路径为中心；允许短期保留 `group-chats.js` 作为导出哑实现（空数组/null/reject），但不得再被 shell 挂为产品面板。
- **Shell / React**：从 `app/stores/workspace-panel-store.js` 与 `app/workspace-panels.tsx` 注册表移除 `groupChats` / `groupAuthoring` 产品项；Character Library 去掉 Group 创建与 group 行组件引用。
- **后端**：`setupPrivateEndpoints` 将 `/api/groups` 指向 retirement router；chats group 路由同样退役。Deprecated redirect（`/getgroups` 等）应落到同一 410，而不是旧实现。
- **Canonical**：本切片最小要求是 **产品与 API 不再产生新的 group 权威写入**；query/recent 实现应避免把 group 会话继续当作可打开的 workspace 结果（忽略或过滤），即便 DB/文件仍残留。
- **生成服务**：`chat-generation-command-service` / bridge contract 中的 `GROUP_CHAT` capability 应从“可自动恢复的可见能力”降为不存在或明确 unsupported，避免 recovery 逻辑以为群聊仍可用。
- **兼容**：扩展保护表面只允许 **缩小** group 相关 DOM 契约并文档化；不得在未改测试的情况下破坏 `.character_select` 等仍需保护的选择器。
- **UI 约束**：若项目根存在 `Product.md` / `DESIGN.md`，不引入新的彩色状态徽章；退役反馈用现有 toastr/系统消息模式即可。
- **脏工作区**：实现时不还原用户未提交的无关改动。

## 数据 / 集成

| 表面 | 退役后行为 |
|---|---|
| `directories.groups` / `directories.groupChats` | 路径约定可保留；本切片不 purge |
| `groups/<id>.json` | 不再经 API 创建/编辑/删除 |
| `group chats/*.jsonl` | 不再经 API 成功 save/import 为权威会话 |
| settings `active_group` | 加载后清空；保存时写空 |
| canonical `owner_type='group'` | 停止新写入；读侧可忽略 |
| `tag_map` 等以 group id 为 key 的标签 | 不强制清理；UI 不再编辑 group tags |
| `st-context.groupId` | 恒空 |
| World Info `group` 字段 | 不变 |

迁移说明：无需强制数据迁移脚本。若未来需要 purge，另开切片并先提供导出/确认。

向后兼容：旧书签/快捷脚本调用群 API → 410 JSON；旧 UI 缓存硬刷新后失去入口。

## 验证

### 自动化（实现阶段必须落 proof）

- 新增或扩展 unit：`group-chat-retirement`（名称可调整）断言 `/api/groups/*` 与 chats group 端点 `410` + 稳定 error 码，且临时用户目录中预置 group 文件内容不变。
- 更新/替换：`tests/groups-route-authoring.test.js`、`tests/group-authoring-facade.test.js`、`tests/character-group-authoring.e2e.js` —— 不再证明“可创作群”，改为证明入口不存在或 API 退役（或删除过时用例并改由 retirement 测试覆盖）。
- `bun run --cwd tests test:unit -- <retirement-and-related>.test.js --runInBand`
- `bun run test:compat`（契约更新后）
- 角色库结构：`bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand`（及必要的 react character-library helpers）
- shell 导航：`bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1`（断言无 Group Chats 入口，其余主入口仍在）
- 文档：`bun run docs:check`

### 手工 / PM

- 浏览器登录 → 确认无 Group 导航/库行 → 打开角色发消息 → 刷新仍单聊。
- 若本地已有 group 数据：确认文件仍在磁盘，且 UI/API 无法打开或保存群。
- 控制台调用 `SillyTavern.getContext().groupId` 为空。

### 完成判据

R1–R12 均有对应 task proof；单聊主路径无回归；文档与兼容契约一致；无“半隐藏但仍可 API 建群”的漏洞。

## Doc ID 契约

| Doc ID | 变更 |
|---|---|
| `feature.group_authoring` | 标为 retired：不再是用户可执行工作流；保留 ID 以免断链，正文改为退役说明与历史边界 |
| `page.chat_workspace` | 去掉 Group Chats 导航/群会话状态承诺；增加 retired group chat 状态（类比 retired vector state） |
| `feature.next_workspace_shell` | 主导航集合去掉 Group Chats；context summary 不再承诺 group chat |
| `feature.character_library_panel` | 列表合同改为 character（+folder/tag）实体，移除混合 group 行与 Create Group 工具 |

绑定验证：`bun run docs:check`；相关 feature/page 正文与代码入口一致。

可选（非阻断）：`.docs/PROJECT_HISTORY.md` / `legacy-cutover-ledger.md` 一行记录退役——可在 wrap-up 或 docs task 写入。

## 参考资料

- 用户确认：产品不再支持多角色会话；授权 brainstorming 包。
- 本地调研：群聊强信号约 80 文件；中枢 `public/scripts/group-chats.js`、`src/endpoints/groups.js`、`public/script.js` 生成分支、`app/workspace-panels.tsx`。
- 退役先例：`.docs/tech/briefs/260715-01-built-in-vector-retirement.md`，`src/endpoints/vector-retirement.js`，`.docs/PROJECT_HISTORY.md` 2026-07-15 vector retirement 行。
- 既有 group authoring 交付（将被产品退役取代其“继续维护”前提）：`.docs/tech/briefs/260716-06-react-character-group-authoring-retirement.md`，`.docs/db/features/group-authoring.md`。
- 兼容：`.docs/tech/third-party-extension-compatibility.md`，`tests/helpers/frontend-compatibility-contract.js`，`AGENTS.md` 中 `.group_select`。
- Canonical：`.docs/project-overview.md` 中 group chat 与 character stats 边界说明。
- Inference：首切片不物理 purge 与不收缩 SQLite schema，是为降低不可逆数据风险并保持与 vector retirement 一致的运营安全边界。
