---
created: 2026-06-20
source: user
confirmed: true
last_updated: 2026-06-20
---

# React Phase 3 Sprint 3 Main Chat Scroll And Positioning Intent

## User Original Request

用户继续要求把 React Phase 3 下一个未完成 Sprint 收敛成可审批、可 delivery 的实现规格。此前用户已经明确连续目标是“写一个 specs 然后 delivery，然后下一个，直到完成 phase3”。

这说明本轮不是补路线图占位稿，也不是泛泛讨论主聊天未来方向，而是要把下一个可交付切片写成能直接交给 `delivery-workflow` 的规格。

## Background & Motivation

`Phase 3 Sprint 1` 和 `Sprint 2` 已经把 `features.react.panels.mainChatMessageList` 建成 guarded hidden controller，并在 visible / finalized / non-editing rows 上落地了 rich-body owner-marker boundary；但 `printMessages()`、`showMoreMessages()`、`scrollChatToBottom()`、`scrollLock`、streaming token append、message actions 和输入框仍由 `public/script.js` 的 legacy 主链拥有。

当时 Phase 3 Sprint 3 路线图 stub 把任务写成泛化的 “`virtualizer.scrollToIndex(...)` + `autoScroll` state” 示例，但这与当前仓库事实不符：自动滚动到底、用户上滚后暂停自动滚动、load-more 后锚点稳定，这些行为已经存在于 legacy 路径。真正还没被主聊天 React island 处理的是：

1. 每个 chat 的阅读位置在切换后不会恢复；
2. long chat 通过 `#show_more_messages` 展开的历史窗口在切换后会丢失；
3. 路线图虽然要求严格推动 TanStack Virtual 采用，但当前 main-chat island 还没有一个真实、与 owner 边界匹配的 Virtual 使用点。

因此，Sprint 3 应该描述“scroll / positioning controller + per-chat restore”这个真实缺口，而不是假装从零实现已经存在的 legacy auto-scroll/load-more 能力。

## Intent Domains

### Domain: Sprint 3 必须是可 delivery 的 scroll/positioning 规格，而不是路线图占位稿

- **User expectation:** 下一个未完成 Sprint 需要一份可直接交给 `delivery-workflow` 的实施规格。
- **Current status:** delivered
- **Change history:**
  - 2026-06-20: 用户要求继续对 React Phase 3 main-chat 路线图材料执行 `brainstorming`
  - 2026-06-20: 用户此前已确认 Phase 3 采用“spec -> delivery -> 下一个”的连续推进方式
  - 2026-06-20: 结合代码与文档核对，当前 Sprint 3 路线图 stub 被判定为过于泛化，需收敛为真实可交付切片
- **Implementation traceability:** implemented paths `public/script.js`, `app/workspace-panels.tsx`; proof `tests/chat-message-rendering.e2e.js`, `tests/chat-message-layout.e2e.js`, `tests/chat-message-streaming.e2e.js`, `tests/react-workspace-panels-helpers.test.js`; owning docs `.docs/tech/react-modernization-roadmap.md`, `.docs/db/pages/chat-workspace.md`, `.docs/db/features/chat-message-rendering.md`; delivery status `implemented and reviewed`

### Domain: 用户可感知的增量应该是“每个 chat 的阅读位置和历史窗口恢复”

- **User expectation:** React main-chat 的下一个切片应该解决用户在长聊天里切换上下文后丢失阅读位置的问题，而不是只重复已有 auto-scroll 语义。
- **Current status:** delivered
- **Change history:**
  - 2026-06-20: 核对 `printMessages()` / `showMoreMessages()` / `scrollChatToBottom()` 后确认，当前 auto-scroll、scroll lock 和 load-more anchor 稳定已由 legacy 提供
  - 2026-06-20: 因此 Sprint 3 的真实用户缺口改写为 per-chat scroll restore 和 expanded-history window restore
- **Implementation traceability:** owner split remains `public/script.js` + `app/workspace-panels.tsx`; browser proof `tests/chat-message-rendering.e2e.js`; delivery status `implemented and browser-validated`

### Domain: Sprint 3 继续保护 direct-child `.mes`、load-more、streaming 和扩展兼容面

- **User expectation:** 即使加入 scroll/positioning controller，也不能把外层 `.mes` row owner、`#show_more_messages`、streaming token path、message actions 或 `eventSource` / `event_types` 公共表面打散。
- **Current status:** delivered
- **Change history:**
  - 2026-06-08: main-chat successor docs 已将 `.mes` DOM、streaming、actions 与扩展兼容面归为 protected surfaces
  - 2026-06-20: Sprint 3 设计沿用该边界，只允许 React 接管测量、恢复和窗口扩展协同，不接管可见 row DOM owner
- **Implementation traceability:** protected docs `.docs/tech/main-chat-successor-scope.md`, `.docs/tech/main-chat-rendering-call-chain.md`, `.docs/tech/third-party-extension-compatibility.md`; protected code `public/script.js`; implemented React controller `app/workspace-panels.tsx`; proof `bun run test:compat`, `tests/chat-message-rendering.e2e.js`, `tests/chat-message-layout.e2e.js`, `tests/chat-message-streaming.e2e.js`; delivery status `implemented and compatibility-validated`

### Domain: TanStack Virtual 的采用要真实，但必须匹配当前 owner 边界

- **User expectation:** 路线图要继续严格推动 TanStack 栈采用，但不能为了“把依赖都用上”而强行把 main-chat 做成新的 `MessageRow` renderer。
- **Current status:** delivered
- **Change history:**
  - 2026-06-16 起: 用户已明确要求路线图严格推动 TanStack Form / Query / Zod 的采用
  - 2026-06-20: 结合当前 main-chat owner split，确认 Sprint 3 最适合把 `@tanstack/react-virtual` 用在 headless measurement / snapshot / restore controller，而不是可见虚拟行 renderer
  - 2026-06-20: 结合官方文档和本地已安装类型，确认 `measureElement`、`initialOffset`、`takeSnapshot()`、`initialMeasurementsCache`、`anchorTo`、`scrollEndThreshold` 可支持该设计
- **Implementation traceability:** dependency surface `package.json`, `node_modules/@tanstack/virtual-core/dist/esm/index.d.ts`; implemented headless controller `app/workspace-panels.tsx`; browser proof `tests/chat-message-rendering.e2e.js`; delivery status `implemented as headless measurement / snapshot / restore only`

### Domain: main-chat 恢复桥要复用现有 `dispatchAction` 模式，而不是另起私有接口

- **User expectation:** 主聊天 scroll restore 若需要 React 请求 legacy 展开更早历史，应尽量复用现有 workspace panel bridge 形状，避免多一套只给 main-chat 用的私有 bridge 风格。
- **Current status:** delivered
- **Change history:**
  - 2026-06-20: 核对 `app/workspace-panels.tsx` 与 `public/scripts/workspace-panels-react-bridge.js` 后确认，shared workspace bundle 已统一使用 `WorkspacePanelBridge.dispatchAction(...)`
  - 2026-06-20: 同时确认 `mainChatMessageList` 当前虽然能接收 `bridge` mount option，但 `renderPanel()` 还未把该 `bridge` 继续传给 `MainChatMessageListWorkspacePanel`
  - 2026-06-20: 因此 Sprint 3 规格改为显式要求把 `bridge` 透传到 main-chat panel，并用 `dispatchAction('loadMoreUntilMessage', { anchorMessageId })` 复用现有 action bridge 模式
- **Implementation traceability:** mount/bridge path `public/scripts/workspace-panels-react-bridge.js`, `public/script.js`, `app/workspace-panels.tsx`; proof `tests/react-workspace-panels-helpers.test.js`; delivery status `implemented and reviewed`

## Non-Goals

- 不新增 `jump-to-latest`、消息搜索、jump-to-message、visible range indicator 或 summary
- 不把 `showMoreMessages()`、`scrollChatToBottom()`、`scrollLock`、`StreamingProcessor` 或 message row HTML 改写为新的 React owner
- 不引入可见 `MessageRow.tsx` 虚拟列表 renderer
- 不迁移 composer、slash commands、message actions 或 provider streaming 协议
- 不把滚动恢复状态持久化到文件、服务端或跨刷新存储；本次只要求当前浏览器会话内恢复

## Source Evidence

- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-ux-trend-recommendations.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `app/workspace-panels.tsx`
- `app/components/character-library/CharacterLibraryPanel.tsx`
- `public/script.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-message-streaming.e2e.js`
- `package.json`
- `node_modules/@tanstack/virtual-core/dist/esm/index.d.ts`
- `https://tanstack.com/virtual/latest/docs/framework/react/react-virtual`
- `https://tanstack.com/virtual/latest/docs/api/virtualizer`
