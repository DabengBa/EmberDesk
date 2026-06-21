# Phase 3 Sprint 1: 消息列表 - 基础渲染

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 1（全局 Sprint 14/40）
- **预计工期**：3 周
- **风险等级**：中

---

## 目标

交付一个受 feature flag 控制的 React 主聊天消息列表承载层，在不破坏现有 `.mes` DOM、事件和扩展兼容面的前提下，为后续主聊天 React 化建立 guarded island 边界。

### 主要交付物

1. 新增 `features.react.panels.mainChatMessageList` flag，并接入 workspace React feature payload
2. 复用共享 `app/workspace-panels.tsx` bundle，为 main-chat 提供 guarded React controller
3. 在 `#chat` 内挂载隐藏 React host，并在 flag 开启时保持 `#show_more_messages` 与可见 `.mes[mesid]` 直接子节点顺序稳定
4. 保持 `.mes` class、`mesid` 属性、`.mes_text`、reasoning/media/file wrappers 和 swipe affordance
5. 保留 legacy `printMessages()` / `redisplayChat()` / `showMoreMessages()` / formatter / streaming / actions owner

### 成功标准

- ✅ flag 关闭时完全回退 legacy，flag 开启时只出现单一隐藏 React host
- ✅ seeded stored chat / long chat 在 React flag 开启时继续正确渲染
- ✅ `#chat > .mes[mesid]`、`.mes_text`、reasoning/media/file wrappers、`.last_mes` 和 swipe affordance 保持
- ✅ `#show_more_messages` 和 long-chat load-more 语义保持（扩展兼容性）

---

## 技术设计

### DOM 兼容性

必须保持以下选择器（扩展依赖）：

```tsx
#chat > .mes[mesid]
.mes_text
.mes_reasoning_details
.mes_reasoning
.mes_media_wrapper
.mes_file_wrapper
.swipe_left
.swipe_right
```

### 当前实现边界

- 本 Sprint 不交付新的 `MessageRow.tsx` DOM owner，也不在 React 中重写 formatter、媒体拼装或消息按钮绑定。
- React 通过共享 workspace panel bundle 挂入一个隐藏 controller host，消费 legacy bridge state，并把真实 `.mes` 节点与 `#show_more_messages` 保持在 `#chat` 的直接子节点顺序中。
- 长聊天窗口边界仍由 legacy `power_user.chat_truncation` 和 `showMoreMessages()` 拥有；TanStack Virtual 留给后续 Sprint，在当前 direct-child DOM 契约下另行落地。

---

## 验证清单

- [x] 消息列表渲染正确
- [x] flag 开启时 `#chat > .mes[mesid]` 与 `#show_more_messages` 语义保持
- [x] `.mes` DOM 结构保持
- [x] `bun run test:compat` 通过
- [x] React host 失败时 fail-closed 到 legacy

---

## 下一步

👉 [Phase 3 Sprint 2: 消息列表 - Rich Message Body](phase3-sprint2-message-list-rich.md)
