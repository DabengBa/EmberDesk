# Phase 3: 主聊天工作区迁移

**预计工期**：6 个月（2027 Q1-Q2: 月 1-6）  
**目标**：迁移核心聊天界面到 React  
**风险等级**：高 ⚠️

---

## 概览

Phase 3 是整个现代化路线图的**核心和最高风险阶段**。主聊天工作区是 EmberDesk 最复杂的模块，包含消息渲染、流式生成、斜杠命令、消息操作等核心功能。

**关键策略**：
1. 分阶段迁移（先承载层/owner 边界，再逐步推进 rich-body bridge、scroll、streaming、input、actions）
2. 充分的 E2E 测试覆盖
3. 性能基准对比
4. 保持扩展兼容性（`.mes` DOM 结构与 `eventSource` / `event_types` 公共表面）

---

## 目标

### 主要目标

1. **聊天消息列表承载层迁移**：先在 guarded island 内接管消息列表承载/顺序同步，再逐步推进 rich rendering、scroll 与 virtualization
2. **流式生成 React 化**：SSE 连接、token 追加、停止/恢复
3. **聊天输入框 React 化**：斜杠命令解析、自动补全
4. **消息操作菜单 React 化**：编辑、删除、复制、重新生成

### 性能目标

- 1000 条消息滚动流畅（60fps）
- 流式生成延迟 < 50ms
- 输入框响应 < 100ms

---

## Sprint 列表

| Sprint | 工期 | 目标 | 风险 |
|---|---|---|---|
| [Phase 3 Sprint 1: 消息列表 - 基础渲染](phase3-sprint1-message-list-basic.md) | 3 周 | guarded main-chat controller、direct-child `.mes` 兼容、load-more 承载层同步 | 中 |
| [Phase 3 Sprint 2: 消息列表 - Rich Message Body](phase3-sprint2-message-list-rich.md) | 2 周 | finalized rich-body snapshot / hidden owner-marker boundary、outer `.mes` shell 保持、per-row fallback | 中 |
| [Phase 3 Sprint 3: 消息列表 - 滚动和定位](phase3-sprint3-message-list-scroll.md) | 2 周 | 滚动恢复、自动滚动、定位稳定性 | 高 |
| [Phase 3 Sprint 4: 流式生成 - SSE 连接](phase3-sprint4-streaming-sse.md) | 2 周 | SSE 连接、token 追加 | 中 |
| [Phase 3 Sprint 5: 流式生成 - 控制状态](phase3-sprint5-streaming-control.md) | 2 周 | 停止、暂停、恢复、错误恢复 | 高 |
| [Phase 3 Sprint 6: 输入框 - 基础功能](phase3-sprint6-input-basic.md) | 2 周 | 文本输入、发送、快捷键 | 低 |
| [Phase 3 Sprint 7: 输入框 - 斜杠命令](phase3-sprint7-input-slash.md) | 3 周 | 斜杠命令解析、自动补全 | 高 |
| [Phase 3 Sprint 8: 消息操作 - 菜单](phase3-sprint8-message-actions.md) | 2 周 | 操作菜单、编辑、删除 | 中 |
| [Phase 3 Sprint 9: 整合测试](phase3-sprint9-integration.md) | 2 周 | 完整流程测试、性能优化 | 高 |

---

## 架构决策

### 当前已交付边界

Sprint 1 已交付的不是一个新的 `MessageRow.tsx` DOM owner，而是一个隐藏的 guarded React controller。它在 `#chat` 内维持以下兼容表面：

```tsx
#chat > .mes[mesid]
.mes_text
.mes_reasoning_details
.mes_reasoning
.mes_media_wrapper
.mes_file_wrapper
.swipe_left
.swipe_right
#show_more_messages
```

legacy `printMessages()` / `redisplayChat()` / `showMoreMessages()` / `messageFormatting()` / `updateMessageElement()` 继续是 owner。

Sprint 2 已把同一 `mainChatMessageList` island 扩到 finalized rich-body bridge boundary：`public/script.js` 为 visible / finalized / non-editing rows 生成 snapshot，`app/workspace-panels.tsx` 用 Zod 校验这些 payload，并仅在既有 `.mes_block` 内插入 hidden per-row owner markers。实际 `.mes_text`、reasoning、媒体、文件与 bias 的 HTML 仍来自 legacy rendering chain，而不是第二套 React rich-body renderer。

Sprint 3 已继续扩展同一 island：在不改写可见 `.mes` row owner、streaming、composer 或 message actions 的前提下，React controller 现在会在当前页面会话里按 `chatId` 记录阅读位置和已展开历史窗口，并在用户切回该 chat 时先复用 legacy `showMoreMessages()` 语义重新展开到保存锚点，再恢复原阅读区域。`@tanstack/react-virtual` 在这里已真实落地，但只作为 headless measurement / snapshot / restore controller，不是可见消息列表 renderer。

### 后续阶段重点

- Sprint 2：已交付 finalized rich-body snapshot / hidden owner-marker boundary，不破坏 outer `.mes` / load-more / streaming / actions 契约
- Sprint 3：已交付 per-chat 阅读位置恢复、expanded-history window restore 和 headless TanStack Virtual measurement / snapshot / restore controller
- Sprint 4+：再逐步进入 streaming、input、message actions owner 迁移

---

## 验证门

### 当前验证基线

- [x] ✅ Sprint 1: `mainChatMessageList` flag / bundle contract 已落地
- [x] ✅ Sprint 1: React flag 开启时 stored chat / long chat / mobile load-more proof 继续通过
- [x] ✅ Sprint 1: `test:compat`、`.mes` DOM 和 semantic docs 继续通过
- [x] ✅ Sprint 2: visible finalized rows 的 rich-body snapshot / hidden owner-marker boundary 已落地
- [x] ✅ Sprint 2: stored chat / long chat / finalized streaming proof 继续通过，legacy rich-body rendering chain 保持可见输出 owner
- [x] ✅ Sprint 3: current-session per-chat reading-position restore、expanded-history window restore、load-more anchor stability 和 `#jump_to_latest_message` absence proof 已落地
- [ ] Phase 3 全量完成：流式生成、输入框、斜杠命令、消息操作、整合测试 仍待后续 Sprint

---

## 参考资料

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [主聊天后继者范围](../../tech/main-chat-successor-scope.md)
- [Phase 3 Sprint 2 dated spec](../260620-02-react-phase3-sprint2-main-chat-rich-message-bodies/spec.md)
- [Phase 3 Sprint 3 dated spec](../260620-03-react-phase3-sprint3-main-chat-scroll-and-positioning/spec.md)

---

## 下一步

👉 [Phase 3 Sprint 4: 流式生成 - SSE 连接](phase3-sprint4-streaming-sse.md)
