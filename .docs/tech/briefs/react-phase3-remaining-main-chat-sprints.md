---
created: 2026-06-21
source: user
confirmed: true
last_updated: 2026-06-21
---

# React Phase 3 Remaining Main Chat Sprints Intent

## User Original Request

用户要求通过 `brainstorming` “编写 phase3 剩余内容 spec 开发文件”。

当前 Phase 3 已交付 Sprint 1-3、Sprint 5 和 Sprint 8；本轮剩余内容是 Sprint 4、Sprint 6、Sprint 7 和 Sprint 9。用户的意图不是立即实现，而是先把这些剩余 Sprint 从路线图级描述收敛为 `delivery-workflow` 可执行的规格文件。

## Background & Motivation

Phase 3 当前采用 guarded `features.react.panels.mainChatMessageList` hidden island：React 已观察和校验消息列表顺序、finalized rich-body snapshot、scroll restore 和 generation-control state，但 `public/script.js` 仍拥有 `Generate()`、`StreamingProcessor`、provider transport、token append、composer、slash-command parser 和 message actions。

旧的路线图级 Sprint 4/6/7/9 文档含有直接重写 SSE、输入框或 slash parser 的示例代码，已不适合当前代码边界。剩余 spec 必须继续沿用现有 guarded island / legacy fallback 迁移模式，先桥接和证明，再决定是否迁移 owner。

## Intent Domains

### Domain: Sprint 4 streaming transport boundary

- **User expectation:** 把旧的 “SSE 连接” Sprint 改写成能交付的 main-chat streaming transport/token-append 边界规格。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 确认当前 Sprint 4 不能按旧 EventSource 示例直接 delivery。
  - 2026-06-21: 重新收敛为 legacy `Generate()` / `StreamingProcessor` owner 保持不变、React hidden island 只消费 `streamingTransport` / token append 快照的边界。
  - 2026-06-21: 已交付 `public/scripts/main-chat-streaming-transport-state.js` hidden snapshot bridge、terminal replay 和 fail-closed marker schema。
- **Implementation traceability:** code paths `public/scripts/main-chat-streaming-transport-state.js`, `public/script.js`, `app/workspace-panels.tsx`; tests `tests/chat-streaming-control-state.test.js`, `tests/chat-message-streaming.e2e.js`, `tests/react-workspace-panels-helpers.test.js`; logic doc `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`; commit `564ef790e feat(react): let main chat bridges bow out quietly`; delivery status `delivered`

### Domain: Sprint 6 basic composer bridge

- **User expectation:** 输入框基础功能进入 React Phase 3，但不能破坏当前 `#send_textarea` / `#send_but` / `Generate()` 发送链路。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 明确 Sprint 6 先做 composer state/action bridge 和 React host marker，不直接替换 visible composer DOM。
  - 2026-06-21: 已交付 `public/scripts/main-chat-composer-state.js` hidden composer snapshot、sendability/focus markers 和 textarea/form scoped refresh observers。
- **Implementation traceability:** code paths `public/scripts/main-chat-composer-state.js`, `public/script.js`, `app/workspace-panels.tsx`; tests `tests/main-chat-composer-state.test.js`, `tests/chat-message-streaming.e2e.js`, `tests/chat-message-layout.e2e.js`; logic doc `.docs/logic-description/main_chat_composer_bridge_processing_flow.md`; commit `564ef790e feat(react): let main chat bridges bow out quietly`; delivery status `delivered`

### Domain: Sprint 7 slash-command bridge

- **User expectation:** slash-command 输入体验可迁移，但 `public/scripts/slash-commands.js` 的 parser、registry、abort/pause/continue 和 `@sillytavern/*` compatibility exports 必须保持。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 明确 Sprint 7 只在 React island 中观察/呈现 slash-command autocomplete and execution state，不重写 parser 或 command registry。
  - 2026-06-21: 已交付 `public/scripts/main-chat-slash-command-state.js` hidden slash snapshot、autocomplete visibility/execution state markers 和 compat-safe bridge state。
- **Implementation traceability:** code paths `public/scripts/main-chat-slash-command-state.js`, `public/scripts/slash-commands.js`, `public/script.js`, `app/workspace-panels.tsx`; tests `tests/main-chat-slash-command-state.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/third-party-extension-compatibility.test.js`; logic doc `.docs/logic-description/main_chat_slash_command_bridge_processing_flow.md`; commit `564ef790e feat(react): let main chat bridges bow out quietly`; delivery status `delivered`

### Domain: Sprint 9 integration closure

- **User expectation:** Phase 3 结束前要有整合测试、性能证据、compat proof、docs/Doc ID 收口，而不是只把路线图表格打勾。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 旧 Sprint 9 文档中的全量完成清单被视为过期路线图模板，新的 Sprint 9 只在 Sprint 4/6/7 交付且 Sprint 8 保持当前已交付边界后关闭 Phase 3。
  - 2026-06-21: 已补齐 flag-on / flag-off E2E、compat gate、docs sync 和本地 interaction perf smoke，按当前批准的 guarded hidden-island scope 关闭 Phase 3。
- **Implementation traceability:** test paths `tests/chat-message-rendering.e2e.js`, `tests/chat-message-streaming.e2e.js`, `tests/chat-message-layout.e2e.js`, `tests/chat-message-list-walkthrough.e2e.js`, `tests/third-party-extension-compatibility.test.js`; docs `.docs/specs/react-phase3-main-chat/README.md`, `.docs/tech/react-modernization-roadmap.md`, `.docs/PROJECT_HISTORY.md`; perf artifact `artifacts/interaction-perf/2026-06-21T09-39-58-706Z/report.md`; commit `564ef790e feat(react): let main chat bridges bow out quietly`; delivery status `delivered`

## Non-Goals

- 不在 spec 阶段实现代码。
- 不把 Phase 3 改成全站 SPA 或 visible React message-row renderer。
- 不移除 legacy composer、legacy slash parser、legacy message action handlers 或 protected `.mes` DOM。
- 不引入 provider protocol rewrite、provider pause/resume、MCP/tool execution、artifact/canvas 或 storage migration。

## Resolved Scope Decisions

- 2026-06-21: 按 `.docs/specs/react-phase3-main-chat/README.md`、`.docs/tech/react-modernization-roadmap.md` 和 `.docs/PROJECT_HISTORY.md` 的当前一致事实，Sprint 8 已交付，不属于本轮“剩余 sprint” spec 集。
- 2026-06-21: 本 brief 只为 Sprint 4 / 6 / 7 / 9 提供上游意图；Sprint 8 继续以既有交付文档和 dated spec 为准。

## Source Evidence

- `.docs/specs/react-phase3-main-chat/README.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/features/chat-generation-auto-recovery.md`
- `Product.md`
- `DESIGN.md`
