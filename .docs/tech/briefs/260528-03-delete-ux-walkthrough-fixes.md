# Brief: 260528-03 Delete UX Walkthrough Fixes

## User Original Request

- "$brainstorming 针对问题,指定修复计划"
- "C:\\SyncFiles\\Softwares_Downloads\\dev\\Agents-Prompt\\低频skills\\ux-walkthrough 测试这一改动."

## Background & Motivation

2026-05-28 的 UX 走查验证了“统一角色删除确认面板”的核心路径：批量删除确认面板内能同时显示临时聊天丢失提示、聊天文件选项、World Info cascade 和 `全部删除`，确认后没有第二层弹窗。但走查同时暴露了三个可交付问题：普通 UI 中点击“临时聊天”后状态仍显示“永久的”，单删 `Delete All` 后控制台出现 `Cannot read properties of undefined (reading 'name')`，批量选择主要依赖点击整张角色卡且选择语义不够明显。

## Intent Domains

- 临时聊天状态反馈：用户进入临时聊天后，主工作区应明确显示临时状态，便于用户理解删除确认中的未保存消息风险。
- 删除后空态安全：删除当前选中角色后，任何残留点击或标题入口不得继续用失效 `this_chid` 读取 `characters[this_chid].name`。
- 批量选择可发现性：批量编辑模式应让用户更容易知道“点击角色卡可选择”，同时保留可访问语义和 legacy `.bulk_select_checkbox` 兼容面。
- 回归验证：浏览器走查暴露的问题应有 focused unit/compat/browser 证据覆盖。

## Non-Goals

- 不重写角色删除 API、World Info cascade API、聊天文件删除语义或角色文件格式。
- 不改变 `temporaryChatAcknowledged` 的直接调用兜底安全模型。
- 不重写角色列表分页、增量 reconcile、bulk selection 数据模型或 complex-state full-refresh fallback。
- 不移除或重命名 `.character_select`、`.character_selected`、`.bulk_select_checkbox`、`data-chid`、legacy `chid`、`id="CharID${chid}"`。
- 不把本次修复扩大为全站可访问性清理或完整角色列表视觉 redesign。

## Recommended Scope

第一个可交付切片处理 UX 走查中已经复现的三个问题：在临时聊天入口和状态文本之间建立一致的可见反馈；为删除后的 selected-character 标题入口和 `select_selected_character()` 增加失效角色边界；在批量编辑工具条和角色卡选择语义上增强提示、ARIA 状态和键盘/辅助技术可达性，同时保持现有类名和点击角色卡选择的操作模型。

## Implementation Traceability

- 临时聊天状态反馈：`public/index.html` 增加 `#temporary_chat_status`，`public/script.js` 通过 `newAssistantChat()`、`setCharacterName()` 和正常角色选择路径同步显示/隐藏；状态契约记录在 `page.chat_workspace` 和 `feature.character_delete`。
- 删除后空态安全：`public/script.js` 的 `select_selected_character()` 在写入角色编辑字段前验证 `characters[chid]`，`#rm_button_selected_ch` 点击 handler 在当前角色缺失时回到角色列表；浏览器走查确认删除活动角色后点击标题不再出现 `.name` TypeError。
- 批量选择可发现性：`public/index.html` / `public/style.css` 增加短提示 `#bulkSelectionHint`，`public/scripts/bulk-edit.js`、`public/scripts/BulkEditOverlay.js`、`public/scripts/character-list-state.js` 同步 `role="checkbox"`、`aria-selected`、`aria-checked`、checkbox checked 和 legacy `.bulk_select_checkbox`。
- 验证状态：2026-05-28 focused unit、compat、docs check/build 和 Chrome DevTools 走查通过；最终审查记录在 delivery audit，过程 spec 文件会在 wrap-up 后删除。
