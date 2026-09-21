# U-3 面档案：OptionsMenu + SelectChatPopup（会话管理入口）

> U-loop U0 盘点。面排序表序 3，归属「核心」，形态标记 React——两个面的**壳与静态标记已 React 化**，残余集中在 SelectChatPopup 的会话列表（jQuery 模板克隆渲染）与 OptionsMenu 的委托动作层。

## 1. 实现栈与残余点

### OptionsMenu（`#options`）

- **标记**：`app/components/options-menu/OptionsMenu.tsx` React 渲染进 `#options`（`mountOptionsMenu`，workspace-panels.tsx:2282）。`option_close_chat` 有意重复两次（测试钉住 `toHaveLength(2)`）。
- **壳/开合**：`#options` 保 `display:none`；`#options_button` click → fadeIn/fadeOut + `optionsPopper`（Popper top-start，script.js:4131）；外部点击经 document 监听关闭；`isMouseOverButtonOrMenu` 判定。
- **动作层**：单一委托 `$(document).on('click', '#options [id]')`（dom-handlers.js:719）按 id 分发：`option_back_to_main`/`option_start_new_chat`/`option_close_chat`/`option_select_chat`/`option_delete_mes`/`option_regenerate`/`option_impersonate`/`option_continue`。**slash 命令与扩展通过 `.trigger('click', customData)` 传入 `fromSlashCommand`/`additionalPrompt`**——委托链是契约。
- **动态显隐**：`showBranchChatButtons()`（chat-branch.js:66）按分支态直接 `.show()/.hide()` `#option_back_to_main`——对 React 项的 jQuery 直改残余。

### SelectChatPopup（`#shadow_select_chat_popup` > `#select_chat_popup`）

- **标记**：`SelectChatPopup.tsx` React 渲染 header（角色名标题/隐藏 `form_import_chat`/New Chat/Import Chat/`#select_chat_search`/关闭钮）+ 空容器 `#select_chat_div`（mountSelectChatPopup，script.js:10343，`data-react-select-chat-mounted` 幂等）。
- **壳/开合**：`#shadow_select_chat_popup` legacy display/opacity transition；`#select_chat_cross` click 关；打开路径是 `#option_select_chat` trigger（rename/delete 后也用 `.trigger('click')` 重开刷新——hacky 刷新回路）。
- **列表（最大残余）**：`displayPastChats`（script.js:8903）→ `displayChats`（chat-ops-service.js:533）→ `POST /api/chats/search`（服务端搜索，avatar_url 过滤）→ 逐条克隆 `#past_chat_template`（index.html:253）填字段 append 进 `#select_chat_div`。搜索 `#select_chat_search` input → debounce → 重跑 displayChats。无分页。
- **行内动作**（document 委托，dom-handlers.js）：`.select_chat_block` 点击加载会话（loader）；`.renameChatButton` 弹 INPUT popup → `renameChat` → trigger 重开；`.exportChatButton`/`.exportRawChatButton` → `saveChatConditional` + `/api/chats/export` + download；`.PastChat_cross` 确认删除（`fromSlashCommand` customData）。
- **嵌套 React 岛**：`addChatBackupsBrowser`（chat-backups.js:76）在搜索框旁注入 `data-chat-backups-button-host` span + `data-chat-backups-list-host` div——ChatBackups React 浏览器的挂点，随 `displayPastChats` 每次执行。
- **空态**：`#select_chat_empty.select_chat_empty` + Clear search 钮（jQuery 构建）。

## 2. 契约面（不可破坏）

- **钉死 ID**：`shadow_select_chat_popup`/`select_chat_popup`/`select_chat_div`/`select_chat_search`/`selectChatPopupHeaderText`/`ChatHistoryCharName`/`form_import_chat`/`chat_import_file[_type]`/`chat_import_avatar_url`/`chat_import_character_name`/`newChatFromManageScreenButton`/`chat_import_button`/`select_chat_cross`/`select_chat_empty`；`options`/`options_button`/`options-content`；8 个 `option_*` id（含 close_chat ×2）。
- **类/属性**：`.select_chat_block_wrapper`/`.select_chat_block[file_name][highlight]`/`.select_chat_block_filename`/`.select_chat_block_mes`/`.chat_messages_date`/`.chat_file_size`/`.chat_messages_num`/`.renameChatButton`/`.exportRawChatButton[data-format]`/`.exportChatButton[data-format]`/`.PastChat_cross[file_name]`/`.select_chat_actions`/`.avatar`；`#past_chat_template` 模板。
- **行为契约**：`.trigger('click', customData)` 透传（slash commands）；`$('#option_select_chat').trigger('click')` 作为"重开+刷新"惯用法（dom-handlers.js:629、354）；slash-commands.js:436 读 `.select_chat_block[highlight='true']` 定位当前会话删除钮；keyboard.js:21-25 把 `.select_chat_block` 与行内三钮列入键盘导航清单；focus 搜索框的 200ms setTimeout 惯例。
- **API**：`POST /api/chats/search`、`/api/chats/export`、`renameChat`/`delChat`/`displayPastChats` bridge 导出。
- **测试钉住**：`options-menu-react-surface.test.js`（id 清单、close_chat 双份、mount 顺序先于 core 绑定）、`select-chat-popup-react-surface.test.js`（id 清单、index.html 不再含 select_chat_div、`select_chat_cross` 绑定在 mount 之后）、`thumbnail-lazy-image-loading`（avatar img lazy）。

## 3. 状态清单

options 菜单开/关 + 各项可见性（`option_back_to_main` 仅分支会话显示；`option_close_chat` 隐显切换）｜弹层开/关｜列表加载中（loader）/有数据/空态（区分"无会话"vs"搜索无匹配"）｜搜索过滤中（debounce）｜当前会话 `highlight` 标记｜highlightNames 滚动定位 + flash｜重命名 INPUT popup｜删除确认 popup｜导入文件流程｜ChatBackups 岛展开态｜移动端窄屏。

## 4. 样式来源

`public/style.css`：`#options`/`.options-content` 族 ~15 条（1096-1196，菜单浮层+item 布局+hover）；`#shadow_select_chat_popup`/`#select_chat_popup`/`#select_chat_div`/`.select_chat_*` 族（5229-5400）；`.select_chat_empty`。模板克隆行样式全靠 style.css。

## 5. 痛点记录

- `#select_chat_div` 是面上最后一个 jQuery DOM 直写区——`displayChats` 模板克隆，与 React 化壳不齐。
- "重开弹层=刷新列表"回路（`option_select_chat` trigger）——rename/delete 后靠重开刷新，脆且会闪；React 投影后应改成数据重拉。
- `showBranchChatButtons` 对 React 项 jQuery 显隐——应投影进 OptionsMenu 的可见性状态。
- `addChatBackupsBrowser` 每次 displayPastChats 执行一次（幂等但有 sibling 依赖），React 化列表后注入点语义要保留。
- options 菜单项 opacity 0.5→1 hover 体系陈旧；分组仅 hr 分隔。
- `#past_chat_template` 克隆行的 class 集是委托/键盘/测试三钉面——React 行需 1:1 复刻。

## 6. 改造候选（待 U1 拍板）

- `displayChats` 收窄为数据层（fetch+sort），行渲染移交 React 组件挂 `#select_chat_div`；`file_name`/`highlight`/行内钮 class 全保，委托点击继续工作（React 行上合成 DOM 一致）。
- 刷新路径：`renameChat`/`delChat`/import 成功后直接重拉数据重渲染，不再 trigger 重开（保留 trigger 路径兼容）。
- `option_back_to_main` 显隐改投影（分支态进 snapshot）。
- options 菜单视觉：沿用 U-1/U-2 浮层语言（分组/危险项/焦点管理），id/委托不动。
- `#select_chat_search` 可留 legacy input（jQuery `.val()`/`trigger('input')` 被多处调用）——React 读值投影、写回走 trigger input。

## U1 决议（已拍板）

1. `displayChats` 收窄为数据层（fetch+sort），行渲染移交 React——复刻 `.select_chat_block` 全家 class/属性，委托链不动。
2. 刷新回路：rename/delete/import 后重拉数据重渲染，不再"重开弹层"（trigger 路径仍兼容）。
3. `option_back_to_main` 显隐改 React 状态投影，撤 jQuery 直改。
4. `#select_chat_search` 保留 legacy input（外部 `.val()`/`trigger('input')` 契约太多），React 只读不写。
5. options 菜单贴 U-1/U-2 浮层语言（分组/危险项/键盘），`#options` 壳与 Popper 定位不动。

## U2-U5 实施与验收记录

**U2 实施**（已完成，2026-09-21）：

- **数据/渲染分离**：`displayChats`（chat-ops-service.js）不再克隆 `#past_chat_template`——改为 fetch → sort → `renderSelectChatListReact`（script.js → workspace-panels `mountSelectChatList`）投影渲染。新增 `selectChatListGeneration` 代际计数防乱序响应覆盖（顺带修掉 legacy 竞态）。
- **`SelectChatList.tsx`**（新组件）：1:1 复刻模板行契约——`.select_chat_block_wrapper` > `.select_chat_block[file_name][highlight="true"]`、avatar/`select_chat_block_filename`/三件套 meta/`.select_chat_actions`（rename/exportRaw/exportTxt/`PastChat_cross[file_name]`）/`.select_chat_block_mes`。空态 `#select_chat_empty[role=status]` 双分支（无会话 vs 无匹配）+ Clear search 经 `__emberDeskSelectChatListBridge.clearSearch` 回 `.val('').trigger('input').trigger('focus')`。
- **刷新回路**：`displayPastChats` 移除 `$('#select_chat_div').empty()`（React 重渲染覆盖）；rename/delete/import 仍走 `option_select_chat` trigger → `displayPastChats` → React 重渲染，弹层不闪重开。highlightNames 滚动+flash 改为渲染后按 `file_name` 回查行。
- **OptionsMenu 状态投影**：`mountOptionsMenu(host, {showBackToMain})` + `updateOptionsMenuState`；`showBranchChatButtons`（chat-branch.js）改调 `setOptionsMenuBranchVisibility`（script.js 导出，模块引用缓存），React 未挂载时回落 jQuery 写。项常驻 DOM（`display:none` 投影），trigger 路径不受影响。
- **菜单视觉**：`option_delete_mes` 加 `options-menu-danger`（`--warning` 红 + hover 底色）；新增 Esc 关闭（`isOptionsMenuVisible` 门控 + `isComposing` 豁免 + 焦点回 `#options_button`）。
- **保留不动**：`#past_chat_template`（swipe-picker 克隆源）、`#select_chat_search` legacy input、`addChatBackupsBrowser` sibling 注入点、`.trigger('click', customData)` 委托透传、Popper 定位/fadeIn/fadeOut。

**U4 门禁**：tsc clean / eslint clean（4 JS + 3 测试文件）/ vite build workspace-panels ✓ / `test:compat` 110/110 / focused surface tests 12/12（新增 5 钉点：React 行契约类全集、displayChats 无 DOM 写+代际防乱序、模板保留+不 empty、分支投影、危险项+Esc）。组合根白名单补 `setOptionsMenuBranchVisibility`。

**无头浏览器实测**（:8000 实例）：菜单 9 项 `<button>` + 双份 `option_close_chat`（首份 `displayNone` 契约）+ `option_back_to_main` 隐藏；Esc 关闭 ✓；弹层开行（1 行 + `highlight="true"` + 三行内动作类齐）；搜索防抖过滤 → 空态 + Clear search → 恢复；`data-chat-backups-*-host` 注入在位；注入 `chat_metadata.main_chat` 后开菜单「返回到父级聊天」出现、清除后隐藏（双向投影验证）；零 JS 报错。

**U3 验收**：用户"可以,请继续"——菜单分组/危险项、弹层行渲染、搜索/空态/清除、分支显隐均过。

**U5 语义文档**：契约面零变化（选择器/ID/事件/trigger 语义/API 全保），`.docs/db` 无需更新；本档案即台账。
