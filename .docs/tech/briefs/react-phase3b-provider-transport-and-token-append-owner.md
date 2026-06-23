---
created: 2026-06-22
source: user
confirmed: true
last_updated: 2026-06-22
---

# React Phase 3B Provider Transport And Token Append Owner Intent

## User Original Request

用户要求把 `Phase 3B` 剩余 5 个 visible-owner 缺口拆成明确 sprint，并通过 `$brainstorming` 为 `Sprint 2-5` 分别补齐可交付 spec。路线图已把 `Sprint 5` 定义为 `Provider Transport And Token Append Owner`，并把它作为 `Phase 3B` closure。

## Background & Motivation

当前仓库已经有 hidden `streamingTransport` 和 `generationControl` bridge，React 能观察 phase、token/chunk count、fallback attempt、retry visibility、stopped/completed/error terminal state，但 `Generate()`、`StreamingProcessor`、provider transport、token append、`#mes_continue` 和 `.generation_failure_retry` 仍由 legacy owner 驱动。

如果这部分不切换，`Phase 3B` 就无法真正结束，因为 visible row、visible actions、visible composer、visible slash UI 仍然要把最核心的 generation lifecycle 交回 legacy。

## Intent Domains

### Domain: Phase 3B Sprint 5 provider transport and token append owner

- **User expectation:** 在前面几个 visible-owner sprint 的基线上，用 `TanStack Query mutation + Zod transport schema` 接管 visible main-chat generate/send lifecycle、provider fallback、stop / retry / continue、token append 和 assistant row finalization，并作为 `Phase 3B` 的 closure。
- **Current status:** partially delivered
- **Change history:**
  - 2026-06-22: 用户要求为 `Phase 3B Sprint 2-5` 分别编写 spec。
  - 2026-06-22: 路线图已把 `Sprint 5` 定义为 `Provider Transport And Token Append Owner`，并明确它承担 `Phase 3B closure`。
  - 2026-06-22: 本 brief 将 `Sprint 5` 限定为 visible main-chat generation lifecycle owner 切换，不扩展到 quiet/background/non-visible paths 或存储架构改造。
  - 2026-06-22: 当前实现按批准后的第一个可交付切片收口：React-owned visible transport 已覆盖 `submitComposer` 与 `continueLast`，并接管这两条路径的 request classification、token append、stop/fallback sequencing 和 assistant row finalization。
  - 2026-06-22: `retry/regenerate/swipe` 以及 non-OpenAI / group / dry-run / nested-visible path 仍保持 legacy fallback，因此原先设想的 `Phase 3B closure` 还不能提前宣称完成。
- **Implementation traceability:** roadmap source `.docs/tech/react-modernization-roadmap.md`; delivered slice `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`, `.docs/tech/main-chat-generation-lifecycle.md`, `public/scripts/main-chat-visible-transport-owner.js`, `public/scripts/main-chat-streaming-transport-state.js`, `public/scripts/chat-generation-lifecycle.js`, `public/script.js`, `app/workspace-panels.tsx`; product owners `.docs/db/pages/chat-workspace.md`, `.docs/db/features/chat-message-rendering.md`, `.docs/db/features/chat-message-actions.md`, `.docs/db/features/chat-generation-auto-recovery.md`; proof baselines `tests/main-chat-visible-transport-owner.test.js`, `tests/chat-streaming-control-state.test.js`, `tests/chat-generation-lifecycle.test.js`, `tests/chat-message-streaming.e2e.js`, `tests/chat-message-rendering.e2e.js`, `tests/react-workspace-panels-helpers.test.js`; delivery status `first deliverable slice delivered`

## Non-Goals

- 不改 canonical chat storage、JSONL schema、user data ownership 或 provider settings 页面。
- 不把 quiet generation、background generation、dry-run、非主聊天调用、Prompt Manager 或非可见工作流一起迁到 React owner。
- 不新增 provider pause/resume 新语义。
- 不重写 slash-command registry / parser、扩展系统、World Info、Backgrounds 或 Settings。
- 不改变 bounded auto-recovery 的产品语义，只改变 visible owner 和状态实现位置。

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/features/chat-generation-auto-recovery.md`
- `DESIGN.md`
- `public/scripts/main-chat-streaming-transport-state.js`
- `public/scripts/chat-generation-lifecycle.js`
- `public/script.js`
- `app/workspace-panels.tsx`
- `tests/chat-streaming-control-state.test.js`
- `tests/chat-generation-lifecycle.test.js`
- `tests/chat-message-streaming.e2e.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-list-walkthrough.e2e.js`
- `https://tanstack.com/query/latest/docs/framework/react/reference/useMutation`
- `https://tanstack.com/form/latest/docs/framework/react/guides/validation`
- `https://zod.dev/basics`
