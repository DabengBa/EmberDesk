# U-8 Dossier：CharacterLibraryPanel（角色库）

> U-loop 面：`U-8 | CharacterLibraryPanel | 核心 | React | 网格/批量模式/工具栏`
> U0 盘点日期：2026-09-22

## U0 面盘点

### 现状定性：**已迁移**（网格/批量/工具栏三项全部 React 拥有）

U-2 已收编工具栏/tag chips/分页/详情菜单；本轮盘点确认清单注的三项在更早的迁移波中已全部落地：

| 清单项 | 现状 | 证据 |
|---|---|---|
| 网格 | `CharacterLibraryPanel.tsx` `isGrid` + `ResizeObserver` 动态列数 + `character-library-grid-helpers` 行区间计算；工具栏 Grid/List 切换钮 | `panelRowGrid`/`getCharacterLibraryGridColumnCount` |
| 批量模式 | React 行 `aria-checked`/`role=checkbox`/`onBulkToggle` → `bridge.onBulkToggleCharacter` → `characterGroupOverlay` 选择模型；React 工具栏显示 `character-library-bulk-selected-count` + `All`/`Del` 钮 | `CharacterLibraryToolbar.tsx:258-275` |
| 工具栏 | U-2 `CharacterLibraryToolbar.tsx`（New/File/URL/搜索/开合/排序/tag chips/扩展钮槽位） | 上轮已验收 |

### 行为层边界（既定，保留）

- `BulkEditOverlay.js`（1045 行）：选择模型 + 右键上下文菜单开合 + 长按进入选择态 + 批量动作（tag popup/favorite/duplicate/delete/persona/export/cascade——弹层属 U-11 族）
- `#character_context_menu`：React 标记（`CharacterContextMenu.tsx`，5 个契约 ID 钮），jQuery 控制 `.hidden`+定位——契约边界
- `syncBulkSelectionDomState`：经 `.character_select`/`data-chid`/`.bulk_select_checkbox` 契约类向 React 行写 `checked`/`aria-*`/`character_selected`——设计内写入（行重渲后 `CHARACTER_PAGE_LOADED` 触发 `onPageLoad` 重同步）
- legacy bulk 三件套（`#bulkEditButton`/`#bulkSelectedCount`/`#bulkDeleteButton`/`#bulkSelectAllButton`/`#bulkSelectionHint`）：在 `RightNavPanel.tsx` 隐藏契约区，`display:none` + `bulkEditOptionElement`，供 `updateBulkSelectionCountState` 簿记与扩展读取
- `onPageLoad` 的 per-element 监听（click/contextmenu/long-press）：随 `CHARACTER_PAGE_LOADED` 在 React 行上重绑——实测生效

### 实测确认（:8000 无头）

- Bulk 开关 → `bulk_select` 类上行容器 + React 工具栏切出 `N个 | All | Del` 簇
- 点行 → checkbox 勾选 + 行选中高亮 + 计数 `1个` 同步（React 工具栏与 overlay 模型一致）
- 行上右键 → `#character_context_menu` 在光标处展开（5 项契约钮）
- Grid 切换 → `.character-library-react-panel--grid` 生效
- 零 JS 报错

### U0 结论

无老式交互残余可收编。`BulkEditOverlay` 属行为桥（选择模型+动作分发），其 DOM 触点全部走契约类——与 U-4/U-5 的字段绑定同类。批量动作弹层归 U-11。

**建议：同 U-6 记「已迁移」关闭。**

## U5 台账

- 结论：已迁移验证通过，无实施提交
- 文档：本档案（与 U-7 批次一并提交）
