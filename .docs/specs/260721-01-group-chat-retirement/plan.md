# Group Chat Retirement Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260721-01-group-chat-retirement.md`
Doc IDs: feature.group_authoring, page.chat_workspace, feature.next_workspace_shell, feature.character_library_panel

## Tasks

### Task 1: 后端群 API 与 chats group 写路径退役为稳定 JSON 410
- [x] **Done**
- **Reqs:** R5, R6
- **Kind:** behavior
- **Scope:** `src/endpoints/groups.js` 或新建 `src/endpoints/group-chat-retirement.js`，`src/server-startup.js`（`/api/groups` 挂载与 `/getgroups` 等 redirect），`src/endpoints/chats.js`（`/group/*` 与 `is_group` 写路径），`src/server-main.js`（若仍调用 `migrateGroupChatsMetadataFormat` 则改为无害/跳过写入），`tests/group-chat-retirement.test.js`（新建；可吸收/替换 `tests/groups-route-authoring.test.js` 的过时写路径断言）
- **Proof:** command: bun run --cwd tests test:unit -- group-chat-retirement.test.js --runInBand
- **PM:** 对临时用户目录预置 `groups/*.json` 与 `group chats/*.jsonl` 后请求 `/api/groups/all|create|edit|delete` 与 `/api/chats/group/save|get|delete|import` -> 均 HTTP 410 且稳定 `error` 码；预置文件字节不变；单角色非 group 的 chat 路由不受影响
- **Doc IDs:** none
- **Evidence:** evidence/task-01.md
- **Notes:** 对齐 `src/endpoints/vector-retirement.js`；tombstone 不得删盘。

### Task 2: 去掉 shell / 角色库 / authoring 的群产品入口
- [x] **Done**
- **Reqs:** R1, R2
- **Kind:** behavior
- **Scope:** `app/workspace-panels.tsx`，`app/stores/workspace-panel-store.js`，`app/components/character-library/CharacterLibraryPanel.tsx`，`app/components/character-library/CharacterLibraryToolbar.tsx`，`app/components/character-library/CharacterLibraryGroupRow.tsx`（删除或停止引用），`public/index.html`（`#rm_group_chats_block` / `rm_button_group_chats` 等产品控件隐藏或移除），`public/script.js` 中 openGroupChats / group 列表实体构建，相关 CSS 仅当阻挡单聊时可删，`tests/react-workspace-panels-helpers.test.js`，`tests/character-list-structure.test.js`，`tests/character-library-react-helpers.test.js`
- **Proof:** command: bun run build:react:workspace-panels && bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js character-list-structure.test.js --runInBand
- **PM:** 构建后打开 workspace -> shell 无 Group Chats；角色库无 Group 按钮与 `.group_select` 行；仍可点角色进单聊
- **Doc IDs:** feature.next_workspace_shell, feature.character_library_panel, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 运行时强制单聊——清空 active group 并切断生成/打开群路径
- [x] **Done**
- **Reqs:** R3, R4, R8, R12
- **Kind:** behavior
- **Scope:** `public/scripts/group-chats.js`（哑实现或删除可达成功路径），`public/script.js`（`Generate` 群分支、`active_group`/`setActiveGroup`、saveChat 护栏收敛），`public/scripts/RossAscends-mods.js`（启动恢复），`public/scripts/chat-generation-command-service.js` / `main-chat-bridge-contract.js`（`GROUP_CHAT` capability），`public/scripts/st-context.js`，`public/scripts/power-user.js`（群专用可见设置），`public/scripts/slash-commands.js` 与 `SlashCommandCommonEnumsProvider.js`（群成员命令），必要时 `public/scripts/bookmarks.js` 的 convert-to-group / group 打开分支，`tests/chat-generation-command-service.test.js` 与新增/扩展前端 unit
- **Proof:** command: bun run --cwd tests test:unit -- chat-generation-command-service.test.js group-chat-retirement.test.js --runInBand
- **PM:** 设置 `active_group` 为旧 id 后刷新 -> 不进入群聊；`getContext().groupId` 为空；发送单聊消息不进入 group wrapper；群 slash 明确失败
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-03.md
- **Notes:** 优先删除成功路径而非长期 flag；扩展 import 可保留空导出以免硬崩。

### Task 4: 兼容契约与群相关测试改为退役语义
- [x] **Done**
- **Reqs:** R7, R9
- **Kind:** behavior
- **Scope:** `tests/helpers/frontend-compatibility-contract.js`，`.docs/tech/third-party-extension-compatibility.md`，根 `AGENTS.md`（character-list 选择器列表），`tests/third-party-extension-compatibility.test.js`，`tests/group-authoring-facade.test.js`，`tests/character-group-authoring.e2e.js`，`tests/workspace-shell-panel-navigation.e2e.js`，其它仍断言 Group Chats 入口或可写 `/api/groups` 的测试
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1
- **PM:** 运行 compat 与 shell e2e -> compat 绿，shell 主入口仍在且无 Group Chats，过时 group authoring e2e 已删或改为断言不可用
- **Doc IDs:** feature.character_library_panel, feature.next_workspace_shell
- **Evidence:** evidence/task-04.md

### Task 5: 单聊回归与 query/recent 忽略 group 会话
- [x] **Done**
- **Reqs:** R6, R11
- **Kind:** behavior
- **Scope:** `src/endpoints/chat-route-service.js`，`src/endpoints/canonical-chat-query-service.js`（过滤/忽略 group 结果），`src/endpoints/chats.js` 角色路径冒烟，相关 `tests/canonical-chat-query.test.js` / `tests/chat-route-service.test.js` 更新，必要的 e2e 或 unit 证明角色 chat save/get 仍成功
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-query.test.js chat-route-service.test.js group-chat-retirement.test.js --runInBand
- **PM:** 预置残留 group 文件后跑角色 chat recent/search 与 save/get -> 仅返回/写入角色会话，不把 group 文件当作可打开群会话写回
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-05.md

### Task 6: 语义文档退役与 docs:check
- [x] **Done**
- **Reqs:** R10
- **Kind:** non-behavior
- **Scope:** `.docs/db/features/group-authoring.md`，`.docs/db/pages/chat-workspace.md`，`.docs/db/features/next-workspace-shell.md`，`.docs/db/features/character-library-panel.md`，必要时 `.docs/project-overview.md` 一句、`legacy-cutover-ledger` / `PROJECT_HISTORY` 可在本 task 或 wrap-up 补
- **Proof:** command: bun run docs:check
- **PM:** 阅读上述 Doc ID 正文 -> 明确群聊已退役、无 Group Chats 导航、角色库无 group 行、API/数据保留策略与 vector 类退役一致
- **Doc IDs:** feature.group_authoring, page.chat_workspace, feature.next_workspace_shell, feature.character_library_panel
- **Evidence:** evidence/task-06.md

## Review

- [x] Review: R-01 remove dead false-and group Generate branch (severity: low; scope: Task 3; details: deleted unreachable `if (false && selected_group...)` after early retirement return)
- [x] Review complete

### Residual risks
- Large residual `selected_group` branches remain in `public/script.js` and extensions; they are inert while `selected_group` stays null and group open paths are stubbed, but are not fully deleted in this slice.
- Physical purge of user `groups/` / `group chats/` and SQLite `owner_type=group` schema shrink remain deferred by design.
- Full browser e2e against a live server was not run in this delivery pass; unit + docs + workspace-panels build are the automated proof. Playwright files were rewritten for retirement assertions.
