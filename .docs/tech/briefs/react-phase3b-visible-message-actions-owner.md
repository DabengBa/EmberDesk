---
created: 2026-06-22
source: user
confirmed: true
last_updated: 2026-06-22
---

# React Phase 3B Visible Message Actions Owner Intent

## User Original Request

用户在确认 `Phase 3B` 已正式启动后，通过 `$brainstorming` 要求“分别编写 spec 开发文档 sprint2-5”。当前路线图里，`Sprint 2` 已定义为 `Visible Message Actions Owner`，因此本 brief 为这一独立切片提供上游意图。

## Background & Motivation

当前 `Phase 3B Sprint 1` 只把 safe stored / finalized / non-editing rows 的可见 `MessageRow` 外壳切到了 React。`public/script.js` 已能输出 `messageActionSnapshots`，`app/workspace-panels.tsx` 也已能校验并附加 hidden action owner marker，但 copy / edit / delete / retry / swipe / reasoning 等可见按钮、overflow menu 和 mobile reachability 仍由 legacy action shell 拥有。

用户要的是继续推进 visible owner cutover，而不是回到 `Phase 3` 的 hidden bridge 口径，也不是把 actions、composer、slash、transport 合并成一次性大改。

## Intent Domains

### Domain: Phase 3B Sprint 2 visible message actions owner

- **User expectation:** 对已经满足 `Sprint 1` 可见行 owner 条件的消息行，把可见 message actions shell 迁到 React，同时保持 protected selectors、mobile reachability、现有 dialog / retry / swipe / reasoning 行为和 per-row fallback。
- **Current status:** delivered
- **Change history:**
  - 2026-06-22: 用户要求为 `Phase 3B Sprint 2-5` 分别编写 implementation-ready spec。
  - 2026-06-22: 路线图已把 `Sprint 2` 明确定义为 `Visible Message Actions Owner`。
  - 2026-06-22: 本 brief 将 `Sprint 2` 收敛为 React visible action shell cutover，不把 provider transport、visible composer 或 slash UI 混入。
  - 2026-06-22: 当前代码已交付 React-owned visible action shell；safe finalized rows 的 Copy / Edit / Delete / Retry / Swipe / Reasoning surface 迁到 React，可见点击继续通过 legacy bridge 执行，并在 edit / unsafe row 上逐行 fail-closed 回退。
- **Implementation traceability:** roadmap source `.docs/tech/react-modernization-roadmap.md`; delivered code `public/scripts/chat-message-actions-controller.js`, `public/script.js`, `app/workspace-panels.tsx`; owning docs `.docs/db/pages/chat-workspace.md`, `.docs/db/features/chat-message-actions.md`, `.docs/db/features/chat-message-rendering.md`, `.docs/logic-description/main_chat_message_actions_bridge_processing_flow.md`; proof surfaces `tests/chat-message-actions-controller.test.js`, `tests/chat-message-rendering.e2e.js`, `tests/chat-message-layout.e2e.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/chat-workspace-structure.test.js`, `tests/third-party-extension-compatibility.test.js`; delivery status `delivered`

## Non-Goals

- 不在本 Sprint 里迁移 provider transport、token append、visible composer 或 slash autocomplete UI。
- 不重写 `messageFormatting()`、`.mes_text`、media/file live DOM 或 load-more 算法。
- 不改变 edit textarea / reasoning edit textarea 的 legacy owner；进入编辑态后允许该行回退。
- 不新增新的 message action 语义、按钮文案、排序策略或危险操作流程。
- 不改动 canonical chat storage、JSONL schema、World Info、Backgrounds、Extensions 或第三方扩展 API。

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/features/chat-message-rendering.md`
- `DESIGN.md`
- `public/scripts/chat-message-actions-controller.js`
- `public/script.js`
- `app/workspace-panels.tsx`
- `tests/chat-message-actions-controller.test.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-workspace-structure.test.js`
- `tests/third-party-extension-compatibility.test.js`
