# U-4 档案：AI Config 面板（#ai_response_configuration / #left-nav-panel）

> U-loop 面盘点。日期 2026-09-21。前置依赖：B-cut-12（provider 单源）已落地。

## 1. 现状盘点

**标记层已全 React**：`app/components/ai-config/AiConfigPanel.tsx`（329 行）渲染面板全部 DOM——preset 头/字段/分段控件/高级 drawer/模板 textarea 族。`mountAiConfigPanel` 在 startup 序列挂载（先于 `initOpenAI` 绑定）。

**行为层全 jQuery**（`openai.js` `initOpenAI`，~370 行绑定）：

- **字段绑定**：声明式 `settings` 映射表（~35 项 `['#id', 'oai_settings.key', isCheckbox, isSecret]`）——`#openai_max_context`/`#openai_max_tokens`/`#names_behavior`/`#stream_toggle`/`#openai_*` 全族；`custom_*`/`api_key_unified`/`fallback_provider_*`/`test_api_button` 属 ApiConnectionsPanel（兄弟面）。
- **Preset 管理**：`#settings_preset_openai`（`data-preset-manager-for="openai"`）options 由 openai.js 在 ~7 处 `.empty()/.append(option)` 直写；`preset-manager.js` 是跨面共享设施（sysprompt/reasoning/regex/JS-Slash-Runner 同用）。
- **Preset ⋮ 菜单**：`.preset-menu-trigger` click → `.preset-popup-menu` `.show` class 切换（`openai.js:3834`）；项 click 移除 `.show`；document click 兜底关。动作 `import_oai_preset`/`export_oai_preset`/`delete_oai_preset`/`update_oai_preset`/`new_oai_preset`/`[data-preset-manager-rename]` **按 ID 直绑**——React 重渲染会丢绑定。
- **分段控件**：`data-sync-select` radio → 隐藏 select `.trigger('input')`，document 委托（openai.js:3509）——React 友好。
- **滑条对**：`neo-range-slider` + `neo-range-input`（`data-for` 互链）直绑 input 互同步。
- **Prompt Manager**：`#completion_prompt_manager` 空容器 → `PromptManager` 子系统注入整个列表 UI（prompt 列表/编辑弹层/拖拽排序）；`completion_prompt_manager_popup` 已是 React 挂载。
- **微标签**：`#character_names_display`/`#continue_postfix_display` 由 jQuery `.text()` 写。
- **Chrome**：`#lm_button_panel_pin` 锁定 checkbox、`drag-grabber`、`#labModeWarning`、`inline-drawer`（document 委托 dom-handlers.js:1251）。

## 2. 契约面（不可破坏）

- **钉死 ID**：~35 个 settings 映射字段 ID + `settings_preset_openai`/`import|export|delete|update|new_oai_preset`/`openai_preset_import_file`/`bind_preset_to_connection`/`completion_prompt_manager`/`lm_button_panel_pin`/`temp_openai[_counter]`/`top_p_openai[_counter]`。
- **属性/类**：`data-preset-manager-for`/`data-preset-manager-rename`（共享设施）/`data-sync-select`/`data-for`/`openai_restorable`/`title_restorable`/`.checkbox_label`/`.range-block`/`neo-range-*`/`seg-option`。
- **行为**：`.trigger('change'|'input')` 回写 oai_settings；preset option 重建（`.empty().append`）是 preset-manager 共享路径；`saveSettingsDebounced`。
- **测试钉住**：surface 测试（panel React 化既有）；`script-js-reverse-import-contract` 白名单。

## 3. 状态清单

preset 选择/重命名/导入导出/删除/绑定连接开关｜35 字段各自值态（checkbox/number/select/textarea/secret）｜分段控件同步态｜滑条↔数字互同步｜Prompt Manager 注入列表态｜inline-drawer 开合｜pin 锁定｜labMode 警告｜`.preset-popup-menu.show`。

## 4. 样式来源

`style.css`：`.preset-menu-trigger`/`.preset-popup-menu[.show]`/`.preset-popup-menu-item`（6231-6268）；`.range-block`/`range-block-pair`/`input-with-unit`/`neo-range-*`/`segmented-control`/`config-section-header` 族；`.inline-drawer`；`#ai_response_configuration` 布局。

## 5. 痛点记录

- `.preset-popup-menu` 是面板内最后一个老式 `.show` 弹层——无 Esc、无方向键、delete 无危险态，与 U-1~U-3 浮层语言不齐。
- Preset 动作行：3 个 icon-only 钮（Save/Rename/SaveAs）仅 12px 宽，无文字提示密度差；与 ⋮菜单（Import/Export/Delete）功能割裂。
- 面板单长滚动：仅"高级"有 drawer，Features/Prompt Manager/Templates/Other 全展开——信息密度低。
- `#completion_prompt_manager` 注入的子系统是最大单块残余（PromptManager 自渲染列表），本轮不宜收编。
- 字段已是声明式映射 + React 标记——**这面没有"换渲染 owner"的活，只剩交互层收尾与视觉密度决策**。

## 6. 改造候选（待 U1 拍板）

- Preset ⋮ 菜单 → U-1 同款浮层（React state 开合 + Esc + 外点 + delete 危险态）；**菜单项常驻 DOM**（直绑 ID 存活），React 只控 `.show`/定位。
- Preset 行重组选项：A=维持现状（select + 3 icon 钮 + ⋮）；B=Save/Rename/SaveAs 收进 ⋮菜单（行上只剩 select+⋮）；C=icon 钮加粗/加 tooltip 文案。
- 分节密度：A=维持单滚动；B=Templates/Other 并入"高级"drawer；C=每节一个 inline-drawer（委托机制现成，零新机制）。
- Prompt Manager 内嵌列表 → 边界保留（子系统级，单独轮次）。
- 字段控件（滑条/分段/检查框）维持契约 + 仅视觉微调。

## U1 决议（已拍板）

1. Preset ⋮菜单 → 浮层化（React state 开合 + Esc + 外点 + delete 危险态）；菜单项常驻 DOM 保直绑。
2. Preset 行选 **B**：select + ⋮——Save/Rename/SaveAs 收进 ⋮菜单。
3. 分节密度选 **B**：Templates/Other 并入"高级"drawer——**核查发现已是现状**（drawer 含高级采样/图像生成/设置/模板/其他 5 节），零改动确认。

## U2-U5 实施与验收记录

**U2 实施**（已完成，2026-09-21）：

- **`PresetActionsMenu.tsx`**（新组件）：React 只拥有开合状态——菜单项常驻 DOM（`initOpenAI` 的 `$('#id').on('click')` 直绑因此存活），`.preset-popup-menu`/`.preset-popup-menu-item`/`.preset-menu-trigger` 契约类全保，`.show` 由 React state 驱动。trigger 升级为 `<button>` + `aria-haspopup="menu"`/`aria-expanded`；Esc 关闭回焦、外点 `mousedown` 关闭、打开自动聚焦首项。
- **Preset 行收敛 B**：`update_oai_preset`/`new_oai_preset`/`data-preset-manager-rename` + Import/Export/Delete 全部收进菜单（Save/SaveAs/Rename ｜ Import/Export ｜ Delete 危险沉底），`#openai_preset_import_file` 隐藏 input 迁入组件仍常驻。行上剩 select + bind 开关 + ⋮。
- **openai.js**：删除 `.preset-menu-trigger`/`.preset-popup-menu-item`/document 三块旧开合绑定（React 单 owner）；动作绑定不动。
- **CSS**：`.preset-actions-menu` 新锚点（position:relative）；`.preset-popup-menu` 底色 `SmartThemeBodyColor`(浅色违和) → `SmartThemeBlurTintColor`（与 U-1~U-3 深色浮层一致），item 字色反转为 `SmartThemeBodyColor`；新增 `hr` 分隔与 `.preset-menu-danger`。
- **保留不动**：~35 字段声明式映射、preset select 的 preset-manager 共享路径、`neo-range-*` 滑条对、`data-sync-select` 分段控件、PromptManager 注入、`#completion_prompt_manager`、微标签、pin/chrome。

**U4 门禁**：tsc clean / eslint clean / vite build workspace-panels ✓ / `test:compat` 110/110 / focused `ai-config-react-surface.test.js` 4/4（钉点更新：preset ID 迁至菜单组件、`.show` React 独占断言、直绑存活断言）。

**无头浏览器实测**：行形态 B（inline 钮消失）✓；菜单 6 项分组+危险色 ✓；Esc+回焦 ✓；外点关 ✓；`aria-expanded` 同步 ✓；隐藏项 `$('#update_oai_preset').trigger('click')` 程序化触发存活（preset-manager.js rename→save 链路依赖）✓；点 Save 动作+菜单自闭 ✓；高级 drawer `openInlineDrawer` 正常 ✓；零 JS 报错。

**U3 验收**：用户"好了继续"。

**U5 语义文档**：契约面零变化（ID/data-*/trigger 语义/共享 preset-manager 路径全保），`.docs/db` 无需更新；本档案即台账。
