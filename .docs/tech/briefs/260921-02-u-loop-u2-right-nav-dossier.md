# U-loop U-2 面档案：右导航（角色列表 + 角色详情卡）

> U0 盘点产物，2026-09-21。工作流：`.docs/tech/ui-ux-modernization-workflow.md`。供 U1 设计提案引用。

## 范围

`#rightNavHolder > #right-nav-panel` 抽屉内全部内容：顶部条（pin/hotswap/tabs/`rm_button_selected_ch`/`temporary_chat_status`/`result_info`）+ `.right_menu` 族（`rm_characters_block` 角色列表、`rm_ch_create_block` 角色详情卡、`rm_character_import` 导入面板）+ 关联弹层 `#character_popup`（Advanced Definitions）与 `CharacterContextMenu` 右键菜单。

## 1. 实现栈：React 壳 + 行/表单已 React 独占，jQuery 负责编排与外围

**React 独占**（两个 bundle：`workspace-panels.js` 与 `character-library-panel.js`）：

- `app/components/right-nav/RightNavPanel.tsx`（287 行）：抽屉内壳标记——nav 按钮、pin/lock、`HotSwapWrapper`/`hotswap` 收藏条、`result_info` token 统计块、`rm_ch_create_block` 表单标记、`rm_characters_block` 工具栏+搜索+tag 容器+分页容器+列表宿主。
- 列表行：`renderCharacterListPage` → `renderCharacterListPageReact` → `mountReactCharacterLibraryPanel`（`script.js:3787/4805`）挂 `CharacterLibraryPanel`/`CharacterLibraryCharacterRow`（`data-react-character-library-owner="react"`，`isReactCharacterLibraryPanelEnabled()` 恒 true——flag 已退役）。
- 详情卡表单：`AuthoringWorkspacePanel`（`app/workspace-panels.tsx`）挂 `#rm_ch_create_block` 内 `emberdesk-react-character-authoring-panel-host`；`form_create` 被 `hideLegacyCharacterAuthoringEditor(true)` 常驻隐藏，仅作弹层工具写入宿主；缺 bundle 时 fail-closed 报错块。
- `CharacterPopup.tsx`：`#character_popup`（Advanced Definitions）标记为 React，但开合/字段填充仍 legacy。
- `CharacterContextMenu.tsx`：行右键菜单。
- `CharacterLibraryToolbar`：独立挂载（`emberdesk-react-character-library-toolbar`）。

**jQuery 残余点**：

- `printCharacters`（`script.js:4719`）编排：pagination.js 插件驱动 `#rm_print_characters_pagination`（页大小选择器/navigator/`Characters_PerPage`/`saveCharactersPage`）→ `createCharacterListPageRenderPlan` → React 行渲染；`entitiesFilter`/`getEntitiesList({doFilter:true})` 过滤排序；`printTagFilters` → `.rm_tag_filter` + `.rm_tag_bogus_drilldown` tag chips DOM 直写（`tags.js:1388`）；`applyTagsOnCharacterSelect`；列表 scrollTop 恢复。
- 工具栏输入态：`#character_search_bar`（jQuery input→filter）、`#character_sort_order`（change→重排）、`#charListGridToggle`（`body.charListGrid` 类切换 + 标签 Grid/List 互换，`script.js:9803`）、`#rm_button_search` 开合。
- Bulk 模式：`bulk-edit.js` 在 `rm_print_characters_block` 上翻 `.bulk_select` 类 + `BulkEditOverlay.js` 动作层；React 行读 `bulkMode` 渲染 `role=checkbox`/`bulk_select_checkbox`。
- 详情卡外围：`select_selected_character` 填充/切面板、`form_create` submit → `createOrEditCharacter`、`actiontype` 属性驱动 create/edit、`#char-management-dropdown` 13 项动作菜单（在隐藏表单内，dom-handlers.js:1395 大 switch）、`#rm_ch_create_block` input→`countTokensDebounced`、`#tagList`/`#tagInput` tag chips、`editor_maximize`、avatar 上传/预览、`favorite_button`/`world_button`/`delete_button`。
- `#rm_character_import`：`form_import` 文件导入（`character_import_file`/`character_replace_file`）。
- `#character_popup` 壳：script.js 切 display/opacity + `#character_cross`/`#character_popup_ok` 绑定；字段由 jQuery 填（system_prompt/post_history/creator 系）。
- 抽屉机制：`.openDrawer`/`.closedDrawer`/`.pinnedOpen` 类 + `NavOpened` accountStorage 持久化 + `showWorkspaceChildSlotContent` 切 `.right_menu` 显隐（`rm_characters_block` flex / `rm_ch_create_block` block / `rm_character_import` block）。
- Hotswap：`#right-nav-panel .hotswap` 容器（RossAscends-mods:279，有渲染数量上限）。

## 2. 样式来源

| 来源 | 覆盖 |
|---|---|
| `public/style.css` | `rm_*`/`rm_ch_`/`rm_character`/`rm_print`/`rm_tag` ~89 命中、`character-detail-*` 35、`.character_select` 22、`paginationjs-*` 9、`hotswap` 1、`body.charListGrid` 网格族、`drawer`/`openDrawer`/`closedDrawer`/`pinnedOpen`/`fillRight` |
| `public/css/mobile-styles.css` | 抽屉/列表窄屏 5 命中 |
| `character-library-panel.css`（bundle 内） | React 行/网格样式已入 bundle |
| `public/css/tags.css`（如存在）/tags 相关 | `.tags`/`.tag_controls`/`#tagList` chip |

## 3. 契约面（不可破坏）

- **角色行选择器**（AGENTS.md 明列 + 测试钉住）：`.character_select`、`.bogus_folder_select`、`data-chid`、legacy `chid`、`id="CharID${chid}"`、`.character_selected`、`.bulk_select_checkbox`、`.tags_inline`、`.ch_fav`（hidden input）/`.ch_fav_icon`。
- **约 70 个钉死 ID**（`tests/right-nav-react-surface.test.js`）：`right-nav-panelheader`/`CharListButtonAndHotSwaps`/`rm_button_panel_pin[_div]`/`rm_button_characters`/`HotSwapWrapper`/`rm_PinAndTabs`/`right-nav-panel-tabs`/`rm_button_selected_ch`/`temporary_chat_status`/`result_info[_text/_total_tokens/_permanent_tokens]`/`chartokenwarning`/`hideCharPanelAvatarButton`/`rm_ch_create_block`/`form_create`/`character_name_pole`/`avatar_*`/`rm_button_back`/`favorite_button`/`world_button`/`delete_button`/`fav_checkbox`/`create_button[_label]`/`char-management-dropdown`/`advanced_div`/`char_connections_button`/`export_button`/`dupe_button`/`tags_div`/`tagInput`/`tagList`/`spoiler_free_desc`/`creator_notes_*`/`descriptionWrapper`/`description_textarea`/`firstMessageWrapper`/`firstmessage_textarea`/`hidden-divs`/`character_json_data`/`avatar_url_pole`/`selected_chat_pole`/`create_date_pole`/`last_mes_pole`/`character_world`/`rm_character_import`/`form_import`/`character_import_file[_type]`/`character_replace_file`/`rm_characters_block`/`charListFixedTop`/`rm_button_bar`/`rm_button_create`/`character_import_button`/`external_import_button`/`rm_buttons_container`（扩展槽）/`character_sort_order`/`rm_button_search`/`charListGridToggle`/`bulkEditButton`/`bulkSelectionHint`/`bulkSelectedCount`/`bulkSelectAllButton`/`bulkDeleteButton`/`form_character_search_form`/`character_search_bar`/`character_search_status`/`rm_print_characters_pagination`/`rm_print_characters_block`。
- **骨架断言**（`character-list-structure.test.js`）：tool-group 四类分组、`character-list-action-label`、`titleKey`/`ariaLabel` 文案表。
- **owner/状态标记**：`data-react-character-library-owner`、`data-menu-type`（`#right-nav-panel` 上）、`actiontype`（form_create）、`bulk_select`/`group_overlay_mode_select` 类。
- **body 级**：`charListGrid`、`bulkEditActive`（如启用时）。
- **事件**：`CHARACTER_PAGE_LOADED`、CHARACTER_EDITED/DELETED/RENDERED 系、tag/filter 相关。
- **持久化键**：`NavOpened`、`Characters_PerPage`、`saveCharactersPage`、grid 偏好（`power_user.charListGrid`）。
- **扩展槽**：`#rm_buttons_container`（第三方按钮注入点）、`@sillytavern` context 的 `characters`/`characterId`/`selectCharacterById`/`openCharacterChat`。
- **测试钉住**：character-list-structure / right-nav-react-surface / character-list-state / character-library-row-helpers / character-popup-react-surface；e2e：workspace-shell-panel-navigation、character-library-bulk-mode、welcome-screen-character-management（若仍存）、third-party-extension-runtime。

## 4. 状态清单

抽屉关/开/pin 钉住 / 列表态（list ↔ grid）/ 搜索过滤中（`character_search_status` aria-live）/ tag 过滤 + bogus 文件夹 drilldown / 分页（页大小切换、页码保持、scrollTop 恢复）/ bulk 选择模式（计数+全选+删除+overlay）/ 空列表（`character_list_empty`）/ 详情卡 create vs edit（`actiontype`）/ 详情卡字段隐藏态（`spoiler_free_desc` 收起 description/first_mes）/ 导入面板 / `#character_popup` 开合 / 行选中态 + `rm_button_selected_ch` 顶栏回跳 / 临时会话态（`temporary_chat_status`）/ favorites hotswap 条 / 扩展注入按钮 / token 统计块（`result_info`）/ React bundle 缺失的 fail-closed 报错块。

## 5. 痛点记录

- `printCharacters` 每次翻页都重建 pagination.js + 全量重算实体快照 + 重新驱动 React 更新——编排层在 jQuery，渲染层在 React，双轨。
- 详情卡双轨：`form_create` 隐藏但仍承载弹层写入与 `actiontype` 状态，`char-management-dropdown` 动作菜单在隐藏表单内（React 面板侧动作入口另有一套）。
- search/sort/tag/grid 四个输入态分散在 jQuery handler + `entitiesFilter` + `power_user` + accountStorage，无统一 owner。
- tag chips（`.rm_tag_filter`/`.rm_tag_bogus_drilldown`/`#tagList`）jQuery DOM 直写，无投影。
- pagination.js 控件外观陈旧（`paginationjs-*` 类），与 React 行视觉不齐。
- `.character_select` 契约密度最高面：行 DOM id/属性被扩展与测试双重钉住，重构余度最小。
- 详情卡 avatar 上传/预览、`editor_maximize`、token counter 跨 React 表单与 legacy 弹层共享——改造时需保持弹层写入路径可达。
- drawer 显隐走 `.right_menu` display 切换 + `showWorkspaceChildSlotContent`，与 React 面板挂载时序耦合（`openWorkspaceChildSlotHostImmediate`）。

## U1 决议（已拍板）

方向：**右-nav 全量 React 化**（用户明确"不要 legacy，替换为 react"，驳回只刷视觉的保守档）。

- **编排状态收编**：搜索词、排序、页码/页大小、tag 过滤集 + bogus 下钻、bulk 选中集 → React store；`printCharacters` 退化为"收集实体 → 发快照"薄桥，翻页/过滤/排序由 React 面板自驱动。
- **控件 DOM 收编**：分页器（pagination.js 退役出此面）、tag chips + 下钻条、工具栏、bulk 动作条全部 React 渲染。
- **工具栏形态**：单行常显，搜索框常显内嵌；排序/tag 过滤等低频检索控件收进可开合第二行。
- **详情卡**：React 表单字段不动，补 ⋯更多浮层菜单（复用 U-1 菜单形态）承接 `char-management-dropdown` 13 项；隐藏 dropdown 保留为契约宿主。
- **契约全保**：`.character_select`/`data-chid`/`chid`/`CharID*`/`.character_selected`/`.bogus_folder_select`/`.bulk_select_checkbox`/`.tags_inline`/`.ch_fav` 全族、钉死 ID、`#rm_buttons_container`、`CHARACTER_PAGE_LOADED`、持久化键（`NavOpened`/`Characters_PerPage`/`charListGrid`）、隐藏 `form_create` 弹层写入宿主。
- **legacy 保留为边界**：`characters[]`/`this_chid` 数据源（投影只读）、select/fav/CRUD/导入/tag 变更命令、`entitiesFilter` 过滤引擎可保留为实现细节。

## U2-U5 实施与验收记录

**U2 实施**（已完成，2026-09-21）：

- **编排层收编**：`printCharacters` 不再驱动 pagination.js——改为 `createCharacterListEntitySnapshot` → `renderCharacterListPage(entitySnapshot)` → React 面板快照。`requestCharacterListPage(page)` 是唯一翻页路径；`currentCharacterListEntitySnapshot` 缓存快照供 reconcile/外部跳页复用。删除 reconcile 改走同一渲染函数（`requestedPage` 传参），`updateCharacterListPaginationState` 删除。
- **React 分页器**：portal 进 `#rm_print_characters_pagination`，paginationjs 契约类全保（`.paginationjs`/`-nav`/`-pages`/`-first|prev|next|last`/`-size-changer`/`.J-paginationjs-*` hooks）。`Characters_PerPage`/`saveCharactersPage`/`CHARACTER_PAGE_LOADED` 语义不变。
- **兼容垫片** `ensureCharacterLibraryToolbarCompatBridges`：种子 `data('pagination')`（`initialized:true` + `model`/`currentPageData` live getters），`.pagination('go'|'previous'|'next'|'first'|'last'|'getCurrentPageNum'|...)` 经插件事件分发路由进 React 翻页；`#rm_button_search` 点击重定向焦点到 React 搜索框。
- **Tag chips React 化**：`tags.js` 新增 `createCharacterTagFilterViewState`（投影 actionable/inList/普通 chips + bogus drilldown + 显隐态）、`cycleCharacterTagFilterState`（DOM-free 三态循环，filter_state/存储/entitiesFilter 三写齐）、`runCharacterTagFilterAction`（保留 action 的 `this=$(chip)` 调用形态）、`expandCharacterTagFilterList`。`printTagFilters` 对 `[data-react-tag-filters-owner]` 宿主跳过 DOM 写但保留 `removeMissingTagFilters` 簿记。`printCharacters` 末尾补 `syncReactCharacterLibraryToolbarState` 防外部 tag 变更陈旧。
- **工具栏**：行1 常显（创建组/搜索/开合钮/网格/Bulk + `#rm_buttons_container` 扩展槽 portal），行2 开合（排序 + `.rm_tag_controls` portal）。legacy `#rm_button_bar`/`#form_character_search_form` 隐藏保留。
- **详情卡 ⋯菜单**：`AuthoringActionsMenu`（U-1 同款浮层），动作从 `#char-management-dropdown` live 投影（扩展注入项自动出现），`editAction` 类控制 create 模式显隐，danger 沉底；执行走 `runManagementAction` 命令 → 置 option.selected + `trigger('change')` 复用原 switch；payload 带 `fields`/`extensions` 时才回填隐藏表单（防非法 draft 清空 legacy 读取源）。
- **HostedDomSlot** 补 unmount 归位（perf-reset 路径不再丢失托管元素）。

**冒烟抓到并已修的 bug**：StyleX `background:` 简写被编译器静默丢弃导致菜单透明（改 `backgroundColor`）；actionable chips 漏 `interactable` 契约类；toolbar 快照不随 `printCharacters` 刷新。

**U4 门禁**：tsc clean / eslint clean / vite build ×2 ✓ / `test:compat` 110/110 / focused unit 66/67（唯一失败 `setTemporaryChatStatus(false)` 为 clean HEAD 既有，B-cut 遗留，与本次无关）/ 无头浏览器实测：3 行渲染、分页 `1-3 / 3`、chips 类契约逐项核对、开合钮、详情卡菜单 14 项 + Esc + 外点关闭、零 JS 报错。

**U3 验收**：用户指令直接推进（"请继续下一个"），以冒烟证据 + 门禁代替逐项走查。

**U5 语义文档**：契约面（选择器/ID/事件/持久化键）零变化，`.docs/db` 无需更新；本档案即台账。
