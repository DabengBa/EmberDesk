# U-7 Dossier：WorldInfoPanel workbench（世界书工作台）

> U-loop 面：`U-7 | WorldInfoPanel workbench | 核心 | React | 条目编辑器结构复杂，单独一轮`
> U0 盘点日期：2026-09-21

## U0 面盘点

### 现状定性：**已迁移（sole-owner React）**，非待迁移面

ADR-0012 明确列出 World Info 为 React 独占面。迁移史：

- `a95061cbe` feat(world-info): seat React workbench as sole visible owner
- `44ec9e5b0` feat(world-info): crown React workbench sole owner with service spine
- `3ae3103b9` refactor(scripts): split world-info engine into state/service modules
- `0c63e2152` fix(world-info): keep workbench search sort focus and sole owner

### 结构栈

| 层 | 文件 | 职责 |
|---|---|---|
| 抽屉壳 | `app/components/panels/WorldInfoPanel.tsx` (164 行) | React 标记：drag-grabber/pin/`wiGlobalPanel` 静态壳/`wiEditorPanel` + `#world_popup` deferred 占位 |
| deferred 片段 | `public/panels/world-info-body.html` (60 行) | legacy 工作台 DOM：toolbar/`#world_editor_select`/`#world_info_search`/`#world_info_sort_order`/`world_more_menu`/多选条/`#world_info_pagination`/`#world_popup_entries_list` |
| React 工作台 | `app/world-info-workbench.tsx` (902 行) + `app/styles/world-info-workbench.styles.ts` (229 行) | TanStack Form + zod + StyleX：全局启用 select/世界书 select/搜索/排序/条目列表/条目编辑器(5 区)/移动端 list↔editor 双 pane |
| 宿主接线 | `public/script.js` `ensureWorldInfoReactHost`/`hideLegacyWorldInfoWorkbench`/`mountReactWorldInfoPanel` | `emberdesk-react-world-info-panel-host` prepend 进 `#wi-holder`；legacy 子树 hidden+inert（sole-owner，`data-world-info-visible-owner="react"`） |
| 命令口 | `app/compat/workspace-commands.ts` `WorldInfoCommands`（18 个命令） | selectWorld/applySearchQuery/applySortOption/setGlobalWorlds/createEntry/createWorld/importWorld/exportWorld/renameWorld/duplicateWorld/deleteWorld/refreshWorld/openEntry/expandLegacyEntry/updateEntryFields/clearSelectedEntry/toggleActivationRules |
| 会话/引擎 | `public/scripts/world-info.js` (5488 行) + `world-info-workbench-service.js`/`world-info-service.js`/`world-info-domain.js`/`world-info-shell-context.js` | 快照源 + 扫描引擎 + TimedEffects + 导入导出 + regex 编辑 + 角色绑定 lorebook |

### 实测确认（:8000 无头）

- `owner: react`，工作台挂载，0 JS 报错
- 世界书 Eldoria 选中：4 条目列表（启用 chip/标题/关键词摘要/位置标签），搜索/排序/8 个世界级+条目级动作钮
- 编辑器 5 区：basic/trigger/content/placement/advanced（sticky/cooldown/delay/scope/group/automation 在 advanced）
- "扫描规则"钮 → `toggleActivationRules` → legacy `wiActivationSettings` 滑条区在 React 控制下浮现（`hideLegacyWorldInfoWorkbench(true, {revealGlobalPanel})`）

### 既定兼容边界（保留，不动）

1. `#world_popup` deferred 片段整树：hidden+inert 常驻——`#world_popup_entries_list`/`#world_editor_select`/`#world_more_menu`/`#world_info_search`/`#world_info_sort_order`/pagination/多选条供扩展与 `expandLegacyEntry` 使用
2. `#wiActivationSettings` 滑条/复选组：legacy 输入，`world_info_*` ID 绑定在 world-info.js，React 只控制显隐
3. `#world_info` select2 多选：hidden 契约
4. `expandLegacyEntry`→`openWorldInfoEntryByUid`：legacy 条目卡展开桥（扩展可达）
5. `WorkspacePanelShell legacyBoundary="activation-import-regex-prompt-delete"`

### U0 发现的**功能缺口**（React 面不可达）

| 缺口 | legacy 位置 | 现状 |
|---|---|---|
| **Backfill Memos**（空标题回填关键词） | `#world_backfill_memos`，world-info.js:2826 直绑 | 无 React 命令，UI 不可达（仅扩展 trigger 可触） |
| **Apply current sorting as Order** | `#world_apply_current_sorting`，world-info.js:2843 | 同上 |
| **条目多选**（全选/批量删除/批量启停） | `#world_multi_select` + `#world_multi_select_bar` | React 列表无多选模式，命令口无批量命令——**power-user 回归** |
| **Move/Copy 条目到其他世界书** | 条目卡 `.move_entry_button` | React 编辑器无入口，仅 `expandLegacyEntry` 隐藏卡路径 |
| **条目 regex 编辑** | legacy 条目卡 regex 区 | `legacyBoundary` 声明内，仅隐藏卡路径 |

### 风险/注意点

- `updateEntryFields` 不触发 remount（`shouldRemount` 特判保持本地草稿焦点）——新增命令需同型特判
- 世界级动作行已平铺 8 钮（新建条目/新建/导入/导出/刷新/重命名/复制/删除）——与 legacy `world_more_menu` 折叠相反，属刻意的密度取向（与 U-2"常显"决策一致），不建议回收
- `select2` 全局多选是 select2 插件最后的挂载点之一，保留即可

## U1 设计提案（已拍板）

候选刀口（按价值排）：

1. **补两个世界级操作**：`backfillMemos` + `applyCurrentSorting` 加入 `WorldInfoCommands` → 收进动作行（或 ⋯ 子菜单）
2. **条目多选模式**：列表多选开关 + 批量 删除/启用/禁用（新命令 `bulkDeleteEntries`/`bulkSetEntriesEnabled`）——较大工作量
3. **条目 Move/Copy + regex 入口**：编辑器挂"高级操作"区，走 `expandLegacyEntry` 或新命令打开 legacy 卡（明确桥，不复制功能）
4. **只记档不实施**：与 U-6 同型关闭，缺口转后续专项

建议：1 必做（小、无争议）；2、3 按你的取舍；4 为兜底。

**用户拍板：1,2,3 全做。**

## U2 实施记录

### 数据层（`world-info-workbench-service.js`）

- 新增 session 方法：`backfillMemos()` / `applySortingAsOrder(start)` / `deleteEntries(uids)` / `setEntriesEnabled(uids, enabled)`——纯数据操作，经 `deps.loadWorldInfo`/`saveWorldInfo`/`setOriginalDataValue`/`deleteOriginalDataValue`（新注入）。
- `applySortingAsOrder` 用 `resolveSortOption()`（session 当前排序）而非固定序，与"当前显示排序"语义一致；顺带修掉 legacy 的 `setWIOriginalDataValue(data, entry.order, ...)` uid 误传 bug。
- `deleteEntries` 删除后清理 `selectedEntryUid`。

### Facade 层（`world-info.js`）

- `backfillWorldInfoMemosFromWorkbench()` / `promptApplyWorldInfoCurrentSorting()` / `bulkDeleteWorldInfoEntries(uids)` / `bulkSetWorldInfoEntriesEnabled(uids, enabled)` / `promptMoveOrCopyWorldInfoEntry(uid, sourceWorld?)`——toastr/Popup UX 与 legacy 逐字对齐（>100 条警告、起始值校验、不可逆确认、目标 select+Move/Copy 双钮）。
- legacy `.move_entry_button` 收编调用 `promptMoveOrCopyWorldInfoEntry`（删 40 行重复弹层逻辑）。
- session deps 注入 `deleteOriginalDataValue: deleteWIOriginalDataValue`。

### 命令口（`workspace-commands.ts` + `script.js`）

- `WorldInfoCommands` +5：`backfillMemos`/`applyCurrentSorting`/`bulkDeleteEntries(uids)`/`bulkSetEntriesEnabled(uids, enabled)`/`moveOrCopyEntry(uid)`。默认 remount 刷新快照。

### React 面（`world-info-workbench.tsx` + styles + helpers）

- 动作行：`多选` 开关（`aria-pressed`）+ `回填标题`/`应用排序`（放 `删除` 前，危险项沉底）。
- 多选模式：行首勾选框（styled span，避免 button 套 input）、行点击=勾选、多选条 `已选 N | 全选 | 清空 | 启用 | 停用 | 删除(红)`；换书自动退出。
- 编辑器新增第 6 区「条目操作」：`移动/复制到其他世界书` + regex 提示行（`countRegexKeywords`，与 domain `isValidRegex` 同语义，`/pattern/flags` 字面量即生效——数据路径本就支持，这里显形）。
- helpers：`isRegexKeyword`/`countRegexKeywords`。

## U3 视觉走查

实测（:8000 无头，Eldoria 4 条目）：

- 12 个 action 钮挂载；多选条显隐正确；已选 2→全选 4；勾选行高亮+✓
- 批量删除确认弹层「Delete 4 world info entries? 此操作不可撤销！」取消干净
- 批量停用 4→启用 4 回环（行 state chip 同步）
- 移动/复制触发——单世界书场景给 toastr 警告「没有可以移动到的其他世界书」（正确路径，数据集限制无法演示目标 select）
- 应用排序弹层（默认 100 + 应用/取消）取消干净
- 零 JS 报错

**用户验收：通过。**

## U4 门禁

| 门 | 结果 |
|---|---|
| tsc --noEmit | clean |
| node --check ×3 | clean |
| eslint（改动文件） | 无新增（88 个均为 HEAD 既有） |
| build:react:workspace-panels | ✓ 已部署 :8000 |
| test:compat | **111/111**（新钉点 +1：`exposes World Info workbench gap-fill commands…`） |
| focused（react-workspace-panels-helpers） | 35/35 |
| 浏览器冒烟 | 全链路 ✓，0 JS 报错 |
| git diff --check | clean |

## U5 台账

- 实施提交：`feat(ui): U-7 world-info workbench gap fills — backfill/apply-sorting, entry multi-select, move/copy + regex affordance`
- 文档提交：本档案 + `260921-06` U-6 简档一并落盘
- 遗留边界（明示不动）：`#wiActivationSettings` legacy 滑条（React 控显隐）、`#world_popup` inert 片段（扩展契约）、select2 `#world_info`、regex 精确编辑（字面量已可用，select2 token UX 仍属 legacyBoundary）、条目多选不与搜索过滤联动（按 uid 选择，符合预期）
