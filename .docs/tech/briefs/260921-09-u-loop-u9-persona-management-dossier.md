# U-9 Dossier：PersonaManagementPanel（用户设定管理）

> U-loop 面：`U-9 | PersonaManagementPanel | 关联 | React | 头像列表/分页/搜索排序/网格`
> U0 盘点日期：2026-09-22；U2 实施日期：2026-09-22

## U0 面盘点

### 现状定性：**分裂所有权**——标记全 React，行为层有大残余

`PersonaManagementPanel.tsx`（145 行）已是全部 DOM 的 React 渲染者，全部契约 ID 在位。但 `personas.js`（~3000 行）仍持有动态渲染残余：

| 区块 | 盘点前 | 性质 |
|---|---|---|
| `#user_avatar_block` 头像列表 | `getUserAvatarBlock()` 克隆 `#user_avatar_template .avatar-container` + append | **jQuery 模板克隆**（U-2 角色库迁移前同款） |
| `#persona_pagination_container` | `.pagination()` 插件 + `empty()`+重 append 回调 | **jQuery 插件 DOM** |
| 搜索 `#persona_search_bar` / 排序 `#persona_sort_order` | input/change → `getUserAvatars()` 重渲 | 契约字段，保留 |
| 网格 `#persona_grid_toggle` | `gridView` 类 toggle | 契约类，保留 |
| 卡锁态徽标 | `updatePersonaUIStates` `.each` 直写 `locked_to_chat`/`locked_to_character`/`selected`/`default_persona` | 随列表迁移改为 props 投影 |
| `#persona_connections_list` | `buildAvatarList` 共享工具（tags/BulkEdit/热切换同用） | **契约边界，保留** |
| 上传/选人/锁/连接行为 | document 委托 + ID 直绑 | 契约边界，保留 |

### 顺带发现的 legacy 缺陷

`.pagination()` 回调里 `$('#user_avatar_block').empty()` 会**永久删除 `.avatar_upload` "+"上传卡**（实测 `uploadPresent: false`）——"上传图片新建 persona"入口自分页插件首渲后一直是死的。本轮迁移由 React 常驻渲染恢复。

### 契约锚点（实测 DOM）

- 卡：`.avatar-container[data-avatar-id]` + `.avatar[imgfile][data-avatar-id][title]` + `.ch_name.flex1` + `.ch_additional_info` + `.ch_description`（无描述时 `text_muted` + `\n\xa0\n\xa0` 三行垫高）+ `.avatar_container_states` 双徽标（`locked_to_chat_label`/`locked_to_character_label`，CSS 由容器 `locked_to_*` 类门控）
- `interactable`/`tabindex`/`role="button"`：keyboard.js MutationObserver 对 `.avatar-container` 自动补齐——React 渲染零改动兼容
- 分页：`.paginationjs` + `.paginationjs-nav.J-paginationjs-nav` + `paginationjs-first/prev/next/last`（disabled 或 `J-paginationjs-*` hook）+ `.paginationjs-size-changer > select.J-paginationjs-size-select`
- 点击：`$(document).on('click', '#user_avatar_block .avatar-container')` → `setUserAvatar`；`.avatar_upload` → `#avatar_upload_file` trigger
- 存储：`Personas_PerPage`（页大小）、`Personas_GridView`（网格）、`savePersonasPage`（页码簿记）

## U1 设计提案（用户批准：全做）

1. 头像列表 React 化（全契约类/属性保留，委托点击零改动）
2. 分页 React 化（镜像 paginationjs DOM，U-2 同款）
3. 搜索/排序输入保留，React 消费其值重渲
4. `gridView` 类由 React 渲染载荷投影到 `#user_avatar_block`

## U2 实施

- **新组件** `app/components/personas/PersonaAvatarList.tsx`：
  - `PersonaAvatarCard` 1:1 复刻模板（含 `imgfile=""` attr、徽标 `data-i18n`/translate 文案、描述三行垫高逻辑移至数据层）
  - `.avatar_upload` "+" 卡迁入组件常驻渲染（修复上述 legacy 缺陷）
  - `PersonaAvatarListPager` portal 进 `#persona_pagination_container`，镜像 paginationjs DOM；翻页/页大小经 `bridge.setPage`/`setPageSize` 回 personas.js
- **`workspace-panels.tsx`**：`mountPersonaAvatarList`/`updatePersonaAvatarList`（U-3 select-chat 同款挂载形态，`flushSync` 同步提交保证委托/observer 即时见 DOM），渲染时向容器投影 `gridView` 类 + `data-react-persona-avatar-list-owner` 标记
- **`PersonaManagementPanel.tsx`**：`#user_avatar_block` 改空宿主（`.avatar_upload` 移出）
- **`personas.js`**：
  - `getUserAvatarBlock` → `buildPersonaAvatarItem`（纯数据投影，含 `getPersonaStates` 锁态 + `selected`）
  - `getUserAvatars`：`.pagination()` 块移除 → `personaListEntities` 状态 + `renderPersonaAvatarList()`
  - `renderPersonaAvatarList()`：页码钳制、切片、`PAGINATION_TEMPLATE` 同义 label（`s-e .. total`）、页大小选项归并、`scrollTop(0)`
  - `navigateToAvatar`：算页→`savePersonasPage`→重渲（替代 `.pagination('go')`）
  - `updatePersonaUIStates`：`.each` 直写 → `renderPersonaAvatarList()` 重投影（右列锁钮/信息块直写保留）
  - `switchPersonaGridView` jQuery 直写保留（与投影同源 accountStorage）
  - 清理 import：`PAGINATION_TEMPLATE`/`localizePagination`/`renderPaginationDropdown`/`paginationDropdownChangeHandler`

## U3 视觉走查（用户验收：继续）

实测（:8000 无头）：

- 列表形态/卡 DOM 与 legacy 一致；`selected` 投影、委托点击选人正常
- **`.avatar_upload` "+" 恢复在列**（原被 `empty()` 吞掉），点击→文件 input 触发 ✓
- 分页条 `1-1 .. 1` + « < > » + `5/页` 尺寸选择器，paginationjs DOM 形状一致
- 搜索 `zzzz`→`0-0 .. 0`+空列表+search 排序项浮现；清空恢复
- 网格/列表切换双向正常（`gridView` 类投影）
- 零 JS 报错

## U4 门禁

| 门 | 结果 |
|---|---|
| tsc --noEmit | clean |
| eslint（personas.js；tsx 走 tsc） | clean |
| build:react:workspace-panels | ✓ |
| test:compat | 111/111 ✓ |
| focused（persona-management-react-surface） | 4/4 ✓（新增钉点：桥渲染断言/模板克隆消亡/卡契约/分页镜像/空宿主） |

## U5 台账

- 实施提交：（本批次）
- 文档提交：（本批次）
- 用户验收：U3 走查通过
