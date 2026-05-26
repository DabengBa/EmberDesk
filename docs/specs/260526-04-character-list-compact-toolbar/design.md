# 角色列表紧凑工具栏与类型标识弱化设计

## 意图与核心流程

本次设计把角色列表顶部控制区压缩为默认两行内可读布局，并弱化每张角色卡上重复出现的 `角色` 类型标识，让用户优先扫描头像、名称、标签和关键操作。

主要参与者是打开角色列表的普通用户和高频管理角色库的 power user。触发条件是用户打开 `#rm_characters_block` 后看到 `#charListFixedTop` 内的创建、导入、排序、搜索、网格和批量编辑控件。

主路径：

1. 用户打开角色列表。
2. 第一行显示主要创建/导入入口和排序控件：`创建`、`导入`、`网址导入`、`群组`、`排序`。
3. 第二行显示查找和视图/批量入口：`搜索`、`网格/列表`、`批量编辑`，批量模式开启后同一行显示 `selected count`、`全选`、`删除`。
4. 用户进入批量模式时，第二行的批量状态保持可见，`删除` 在未选择任何角色时继续保持 disabled。
5. 用户浏览角色卡时，普通角色行不再显式显示 `角色` badge；群组行继续显示 `群组` badge。

## 范围 / 不做范围

本次改变：

- 调整 `#charListFixedTop` / `#rm_button_bar` 的视觉布局，使截图中这些控制默认落入两行，而不是三到四行。
- 保留所有现有按钮、选择器、`data-i18n` 文案和 aria 入口。
- 将 `.character_type_badge` 视觉隐藏或极弱化，但保留 DOM 节点。
- 保持 `.group_type_badge` 可见，让混排列表中的群组仍能被快速识别。
- 更新结构测试和兼容测试，证明 DOM 合约未被破坏。

不做：

- 不重命名或移动 `.character_select`、`.group_select`、`.bogus_folder_select` 等行级选择器。
- 不移除 `small.entity_type_badge.character_type_badge` DOM 节点。
- 不新增用户设置项；这是默认信息层级修正，不是偏好系统。
- 不重做标签筛选区 `.rm_tag_controls` 的信息架构。
- 不把角色列表迁移到新框架或组件系统。
- 不改变搜索展开后的过滤逻辑、批量选择逻辑、导入逻辑或排序语义。

搜索输入和标签过滤区说明：默认两行目标覆盖截图中的工具按钮和排序/批量状态。搜索输入展开后属于过滤内容面板，可以占用工具栏下方空间；但展开状态不得让核心按钮断裂为不可扫描的三到四行。如果实现时能在不牺牲可读性的前提下把搜索输入并入第二行，可以作为同一 slice 的优化，但不是验收前提。

## 边界规则 / 验收

两行布局验收：

- 在常见右侧抽屉宽度下，`#rm_button_bar` 默认最多形成两条视觉行：
  - 第一行：创建/导入/网址导入/群组 + 排序。
  - 第二行：搜索/网格/批量编辑 + 批量选择状态。
- 第一行左侧操作组不得把排序控件挤出可见区域。
- 第二行批量状态出现时，`#bulkSelectedCount`、`#bulkSelectAllButton`、`#bulkDeleteButton` 与 `#bulkEditButton` 保持同一操作语境。
- `#bulkDeleteButton` 在 `0 selected` 时继续 disabled；已有禁用状态语义不退化。
- 所有按钮仍保留图标、文字 label、`title`、`aria-label` 或现有可访问名称。
- 键盘 Tab 顺序必须继续跟随 DOM 顺序：创建、导入、网址导入、群组、排序、搜索、网格、批量编辑、批量状态操作。不得用视觉重排制造键盘顺序和视觉顺序冲突。

类型标识验收：

- 角色行 DOM 中仍存在 `<small class="entity_type_badge character_type_badge" data-i18n="Character">Character</small>`。
- 普通角色卡默认不显示显眼的 `角色` badge。
- 群组模板继续显示 `<small class="entity_type_badge group_type_badge" data-i18n="Group">Group</small>`，中文环境显示为 `群组`。
- 用户自定义标签 `.tags_inline .tag` 不受影响。

窄屏和异常状态：

- 在窄屏断点下，允许按钮 label 降级为更紧凑的显示方式，但不得隐藏图标和可访问名称。
- 如果某个本地化字符串比中文更长，按钮可以通过 `min-width: 0`、`text-overflow` 或仅视觉隐藏 label 来保持行高稳定；不得让文字溢出覆盖相邻按钮。
- 批量模式、搜索忙碌提示 `#character_search_status`、空列表、隐藏计数和标签溢出状态继续沿用现有行为。

## 架构 / 约束

实现应优先使用现有 HTML 分组和 CSS，不重写渲染路径。

现有结构：

- `public/index.html` 中 `#rm_button_bar` 已分为四组：`.character-list-create-group`、`.character-list-sort-group`、`.character-list-view-group`、`.character-list-bulk-actions`。
- `public/style.css` 中这些分组已有 flex 样式和窄屏 wrap 规则。
- `public/script.js` 的 `buildCharacterRowHtml()` 生成角色行，并写入 `.entity_type_badge.character_type_badge`。
- 群组行 badge 来自 `public/index.html` 的 `#group_list_template`。

推荐布局机制：

- 将 `#rm_button_bar` 从自由换行 flex 收紧为两行可控布局。可选路径是 CSS grid，列为 `minmax(0, 1fr) auto`：
  - 创建组位于第 1 行第 1 列。
  - 排序组位于第 1 行第 2 列。
  - 视图组位于第 2 行第 1 列。
  - 批量操作组位于第 2 行第 2 列。
- 保持 DOM 顺序不变。若使用 `order`，必须证明视觉顺序和 DOM 顺序一致；默认不使用 `order`。
- 创建组内部默认不再任意换到多行。空间不足时优先收缩 label，而不是新增第三行。
- `#rm_buttons_container` 继续留在创建组末尾，扩展按钮不得被移除。若扩展按钮过多导致两行目标无法成立，允许扩展容器横向滚动或自然溢出到后续行，并在测试中记录为扩展场景，不影响默认内置控件验收。

推荐类型 badge 机制：

- `.character_type_badge` 使用视觉隐藏或 `display: none`，但 DOM 保留。
- `.group_type_badge` 继续显示，并沿用现有 `entity_type_badge` 样式。
- 不改变 `data-i18n="Character"` / `data-i18n="Group"`，避免破坏本地化和结构断言。

UI 基线说明：仓库当前没有 `docs/skills/shared-ui-baseline.md` 或 `.docs/skills/shared-ui-baseline.md`。本设计改用项目根 `PRODUCT.md` / `DESIGN.md` 的 product register 约束：紧凑、功能优先、语义色稀疏、控件半径和字体大小沿用现有 token。

## 数据 / 集成

本次不新增数据结构、API、存储字段或服务端行为。

必须保持的兼容契约：

- `#rm_characters_block`
- `#rm_print_characters_block`
- `.character_select`
- `.group_select`
- `.bogus_folder_select`
- `.character_select[data-chid]`
- `.character_select[chid]`
- `id="CharID${chid}"`
- `.character_selected`
- `.bulk_select_checkbox`
- `.tags_inline`
- `.ch_fav`

第三方扩展边界：

- `#rm_buttons_container` 是扩展按钮挂载点，必须保留。
- 角色行身份属性和类名不得因为本次视觉优化被删除、重命名或移动到无法被旧选择器命中的位置。
- `data-chid` 继续作为新代码标准身份，旧 `chid` 继续作为兼容属性保留。

## 验证

自动验证：

```powershell
bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand
bun run --cwd tests test:unit -- third-party-extension-compatibility.test.js --runInBand
bun run test:compat
```

建议新增/调整断言：

- `tests/character-list-structure.test.js` 继续断言工具栏四组和所有按钮 id 存在。
- 新增 CSS 断言：`#rm_button_bar` 使用两行约束布局，四个分组有明确布局位置或等效规则。
- 新增 CSS 断言：`.character_type_badge` 默认隐藏或弱化，`.group_type_badge` 仍可见。
- 继续断言 `character_type_badge` DOM 存在，避免把视觉优化误写成 DOM 删除。
- 继续断言 `#bulkSelectedCount` 有 `role="status"`，批量删除禁用状态测试不退化。

手动 / 浏览器验证：

- 在桌面宽度打开角色列表，确认内置工具按钮和排序/批量状态默认两行内显示。
- 在截图相近宽度下复测：第一行包含创建/导入/网址导入/群组/排序；第二行包含搜索/网格/批量编辑/批量状态。
- 开启批量编辑，确认 `0 selected`、`全选`、`删除` 不新起第三行；`删除` 未选中时不可操作。
- 切换中文界面，确认群组行显示 `群组`，普通角色卡不再重复显示醒目的 `角色`。
- 打开搜索输入和标签过滤，确认搜索/过滤行为可用，且核心按钮没有重叠。

## Doc ID 契约

- 复用既有 ID：`feature.character_library_panel`
  - Owner：`.docs/db/features/character-library-panel.md`
  - 绑定点：`#rm_characters_block`、`#charListFixedTop`、`#rm_button_bar`、`#rm_print_characters_block`
  - 验证：实现后更新该 feature 文档中角色列表顶部工具区和类型 badge 的用户可见规则，并运行 docs 检查（若本次改动进入交付收口）。
- 不新增独立 Doc ID。理由：本次是现有角色库面板的信息层级和布局优化，不是新的工作流。

## 参考资料

- `public/index.html`：`#rm_characters_block`、`#charListFixedTop`、`#rm_button_bar`、四个工具分组、搜索条和标签过滤区。
- `public/style.css`：`#rm_button_bar`、`.character-list-tool-group`、窄屏 `@media screen and (max-width: 600px)`、`.entity_type_badge`、`.character_type_badge`、`.group_type_badge`。
- `public/script.js`：`buildCharacterRowHtml()` 生成角色行和 `.character_type_badge`。
- `tests/character-list-structure.test.js`：角色列表结构、窄屏可读性、搜索/网格/批量状态和 badge 结构断言。
- `tests/third-party-extension-compatibility.test.js`：角色行 legacy selector、bulk checkbox 和兼容边界断言。
- `docs/third-party-extension-compatibility.md`：角色列表 DOM contract 和 Tavern Helper 兼容边界。
- `.docs/db/features/character-library-panel.md`：`feature.character_library_panel` 的用户可见流程和 DOM 身份契约。
- MDN CSS `flex-wrap`：https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap
- MDN CSS `order`：https://developer.mozilla.org/en-US/docs/Web/CSS/order
- Inference：两行布局优先使用现有分组和 CSS，而不是移动 DOM，因为当前测试和兼容文档已经把多个 id/class/属性视为角色列表公共契约。
