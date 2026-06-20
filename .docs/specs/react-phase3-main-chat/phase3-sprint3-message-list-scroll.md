# Phase 3 Sprint 3: 消息列表 - 滚动和定位

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 3（全局 Sprint 16/40）
- **预计工期**：2 周
- **风险等级**：高
- **交付状态**：已交付
- **实施入口**：本页是路线图级 Sprint 摘要；进入实现时以 dated spec [`260620-03-react-phase3-sprint3-main-chat-scroll-and-positioning/spec.md`](../260620-03-react-phase3-sprint3-main-chat-scroll-and-positioning/spec.md) 为准

---

## 目标

在不改写可见 `.mes` row owner、streaming、composer 或 message actions 的前提下，让 guarded React main-chat controller 记住并恢复每个 chat 的阅读位置与已展开历史窗口，同时保持 legacy load-more 和 follow-bottom 语义。

### 主要交付物

1. `mainChatMessageList` bridge state 补齐 `chatId`、`scrollTop`、`scrollHeight`、`clientHeight`
2. 在共享 `app/workspace-panels.tsx` bundle 内为主聊天隐藏 controller 增加 per-chat scroll snapshot / restore
3. 复用 `dispatchAction('loadMoreUntilMessage', { anchorMessageId })`，在切回 long chat 时先重新展开包含锚点的历史窗口
4. 用 `@tanstack/react-virtual` 作为 headless measurement / snapshot / restore controller，而不是新的可见消息列表 renderer
5. 保持 `#chat > .mes[mesid]`、`#show_more_messages`、streaming follow-bottom 和 `#jump_to_latest_message` absence 契约

### 成功标准

- ✅ 切换到其他 chat 再切回时，能回到原阅读区域，锚点消息位置误差控制在小容差内
- ✅ 已点击过 `#show_more_messages` 的 long chat 能恢复到已展开窗口，而不是只回到默认截断窗口
- ✅ 同 chat 的 load-more prepend 不再破坏 legacy 锚点稳定性
- ✅ `#jump_to_latest_message` 仍不存在，follow-bottom 语义继续由 legacy owner 保持

---

## 技术设计

### 当前实现边界

- React controller 不渲染新的 `MessageRow.tsx`，也不接管 `messageFormatting()`、`updateMessageElement()`、`showMoreMessages()`、`scrollChatToBottom()`、`scrollLock` 或 `StreamingProcessor`。
- `public/script.js` 继续作为主聊天现状的唯一 bridge owner，并提供窄 bridge action `loadMoreUntilMessage`，其内部仍复用既有 `showMoreMessages()` 语义。
- `app/workspace-panels.tsx` 中的 `MainChatMessageListRestoreController` 只使用 `@tanstack/react-virtual` 的测量、snapshot、offset restore 能力。它不会驱动可见 DOM virtualization，也不会重新引入 jump-to-latest 控件。
- 为避免与 legacy prepend scroll compensation 冲突，controller 会在 virtualizer 更新前同步 `.mes` 的 measured index，并禁用 virtualizer 自己的 item-size scroll adjustment；真正的滚动恢复只发生在 chat re-entry restore 路径。

---

## 验证清单

- [x] 同 session 内切换 chat 后能恢复阅读位置
- [x] long chat 已展开历史窗口可恢复
- [x] load-more 锚点稳定性保持
- [x] mobile load-more、stored chat 和 streaming 相关主链未因该 Sprint 失效
- [x] `#jump_to_latest_message` 仍不存在

---

## 下一步

👉 [Phase 3 Sprint 4: 流式生成 - SSE 连接](phase3-sprint4-streaming-sse.md)
