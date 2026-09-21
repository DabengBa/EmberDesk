# U-5 档案：AdvancedFormattingPanel（#AdvancedFormatting drawer）

> U-loop 面盘点。日期 2026-09-21。前置：B-cut-13（instruct 退役）已落地（`96e91c427`），字段集已稳定。

## 1. 现状盘点

**标记层已全 React**：`app/components/panels/AdvancedFormattingPanel.tsx`（279 行）渲染 `#AdvancedFormatting` drawer 全部内容；`mountAdvancedFormattingPanel` 走 `mountSmallPanel`（startup stage）。

**布局**：`flex-container spaceEvenly` 双列（~311px/列 @ 640px drawer）——左列 `ContextSettings`（5 checkbox），右列 `SystemPromptColumn`（System Prompt 块 + Stopping Strings + Tokenizer + Reasoning + Misc）。

**行为层**：
- **字段**：`power-user.js` 按 ID 绑定（`custom_stopping_strings`/`tokenizer`/`token_padding`/`reasoning_*`/`markdown_escape_strings`/`start_reply_with` 等 → `power_user` 映射 + `saveSettingsDebounced`）。
- **Preset-manager 行 ×2**：`#sysprompt_select`（`data-preset-manager-htmlFor="sysprompt"`）与 `#reasoning_select`（`="reasoning"`）各带 6 icon 钮（update/rename/new + import/export[`displayNone`] + restore/delete）。`preset-manager.js` **全 document 委托**（875-1013：update/new/rename/export/import/file-change/delete/restore）——项可自由挂载/卸载。
- `data-preset-manager-file` 隐藏 file input ×2（import 时 `.trigger('click')` 目标）——须常驻 DOM。
- `editor_maximize`（textarea 放大）document 委托（chats.js:1506）。
- `sysprompt_enabled` power-off 图标开关；`reasoning` 子区用原生 `<details>`。

## 2. 契约面

- **ID**：`af_master_import[_file]`/`af_master_export`、`always-force-name2-checkbox`/`single_line`/`collapse-newlines-checkbox`/`trim_spaces`/`trim_sentences_checkbox`、`sysprompt_enabled`/`sysprompt_select`/`sysprompt_content`/`sysprompt_post_history`、`custom_stopping_strings[_macro]`、`tokenizer`/`token_padding`、`reasoning_*` 全族、`markdown_escape_strings`/`start_reply_with`/`chat-show-reply-prefix-checkbox`。
- **data-\***：`data-preset-manager-{htmlFor,update,rename,new,import,export,restore,delete,file}`（共享设施委托锚点）、`data-macros`、`data-for`（editor_maximize）。
- **类**：`.text_pole`/`.textarea_compact`/`.autoSetHeight`/`.checkbox_label`/`.standoutHeader`/`.menu_button`/`.editor_maximize`。

## 3. 痛点

- 两处 preset 行仍是 6 个 icon-only 钮（U-4 同款问题；import/export 被 `displayNone` 藏起来不可达）。
- 双列 311px 偏挤但可用；右列远长于左列（不平衡）。
- 其余控件（checkbox 林/textarea+maximize/select）均为契约控件，无遗留弹层。

## 4. 改造候选

- 两行 preset 动作收 ⋮浮层菜单（复用 U-4 `PresetActionsMenu` 形态；`data-preset-manager-*` 委托所以项可卸载，但沿用"常驻+show"手法保持一致）。菜单项全量可见化（import/export 不再 displayNone——菜单空间免费且更可达；delete 危险沉底）。
- `data-preset-manager-file` input 留菜单外常驻（import trigger 目标）。
- 布局/字段/chrome 全保留。

## U1 决议（已拍板）

两行 preset 条 → ⋮浮层菜单（U-4 同款）；**菜单里放出原 `displayNone` 的 Import/Export**（用户明确"放出来"）；`data-preset-manager-file` 常驻菜单外；其余全保留。

## U2-U5 实施与验收记录

**U2 实施**（已完成，2026-09-21）：

- **`PresetManagerActionsMenu.tsx`**（新通用组件，`app/components/preset-manager/`）：`apiId` + `noun` 参数化；React 只管开合（`.show` 契约类 + Esc + 外点 mousedown + 自动聚焦首项 + `aria-haspopup/expanded`），动作走 `data-preset-manager-*` 全委托（preset-manager.js 875-1013 不动）。
- **两处收编**：`#sysprompt_select` 行与 `#reasoning_select` 行的 6 icon 钮簇 → `<PresetManagerActionsMenu apiId="sysprompt" noun="prompt" />` / `apiId="reasoning" noun="template"`。行上剩 select + 隐藏 file input + ⋮。
- **菜单 7 项**：Update/SaveAs/Rename ｜ Import/Export/Restore ｜ Delete（`preset-menu-danger` 沉底）；Import/Export 从 `displayNone` 放出（拍板项）。
- **保留不动**：字段映射、双列布局、editor_maximize、`<details>`、power 开关、Master Import/Export。

**U4 门禁**：tsc clean / eslint clean / vite build workspace-panels ✓ / `test:compat` 110/110 / focused 15/15（`config-drawers-react-surface` 新增钉点：7 项 data 契约、行收敛断言、委托存活断言）。

**无头浏览器实测**：2 菜单挂载 ✓ / 行形态收敛 ✓ / 7 项分组+危险色+深色浮层（BlurTint 底，与 U-4 一致）✓ / Esc ✓ / 委托动作事件触发+菜单自闭 ✓ / file input 常驻 ✓ / 零 JS 报错。

**U3 验收**：用户"请继续"。

**U5 语义文档**：契约面零变化（ID/data-*/委托语义全保；Import/Export 可见性是显式拍板的表面调整），`.docs/db` 无需更新；本档案即台账。

**提交**：`cb36bf5df` — `feat(ui): U-5 advanced-formatting preset rows as floating menus`
