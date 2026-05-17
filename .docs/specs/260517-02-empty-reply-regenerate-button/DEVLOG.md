# Empty Reply Regenerate Button — DEVLOG

## 功能

当 AI 角色最后一条回复为空时，在消息气泡内显示"重新生成"按钮。

## 实现

- **事件挂钩**：监听 `CHARACTER_MESSAGE_RENDERED`（`events.js:49`），在 `addOneMessage()` 后触发，DOM 已就绪
- **空回复检测**：`chat[messageId]` 使用 `is_user`/`is_system`/`mes`/`display_text` 字段，仅对最后一条 AI 消息生效
- **按钮注入**：在 `.mes_text` 容器内 append `div.empty_reply_regenerate.menu_button`，复用现有按钮样式
- **触发方式**：点击触发 `$('#option_regenerate').trigger('click')`，复用现有 regenerate 机制（含群聊分支）

## 变更文件

- `public/script.js:12568-12583` — 事件监听器 + 按钮注入逻辑（+16 行）
- `public/style.css:618-620` — `.empty_reply_regenerate` 居中样式（+3 行）

## 设计决策

- 使用 `CHARACTER_MESSAGE_RENDERED` 而非 `MESSAGE_RECEIVED`：非流式路径中 `MESSAGE_RECEIVED` 先于 `addOneMessage()` 触发，DOM 未就绪
- 仅对 `messageId === chat.length - 1` 生效：避免 regenerate 误删非末尾消息
- `display_text` 优先级高于 `mes`：覆盖部分消息通过 `display_text` 展示不同文本的场景
- 无自动化测试：纯 UI 事件 + DOM 注入，无可靠自动化测试 surface
