---
created: 2026-06-22
source: user
confirmed: true
last_updated: 2026-06-22
---

# React Phase 3B Visible Composer Intent

## User Original Request

用户通过 `$brainstorming` 要求为 `Phase 3B Sprint 2-5` 分别补齐可交付 spec。路线图中 `Sprint 3` 已定义为 `Visible Composer`，并明确要求严格推进 `TanStack Form + Zod` 与 `TanStack Query` 的采用。

## Background & Motivation

当前主聊天已经有 hidden `composer` bridge：React 能观察 `valueLength`、`isEmpty`、`canSubmit`、`isFocused`、`isDisabled`、`isGenerating` 和 `activeContext`，但可见 `#send_textarea` / `#send_but`、Enter / Shift+Enter、clear、empty-submit 和 focus UX 仍是 legacy owner。

用户之前已明确希望路线图不要停在 hidden bridge，而要继续把 visible owner 缺口拆开推进；同时这条线必须遵守已确认的 TanStack adoption 方向，而不是在主聊天里再引入另一套表单模式。

## Intent Domains

### Domain: Phase 3B Sprint 3 visible composer

- **User expectation:** 在不提前重写 provider transport 和 slash UI 的前提下，把可见 composer 切到 React/TanStack Form owned surface，保留当前 dense chat shell、keyboard semantics、focus 行为和 guarded fallback。
- **Current status:** delivered
- **Change history:**
  - 2026-06-22: 用户要求继续为 `Phase 3B Sprint 2-5` 分别补齐 spec。
  - 2026-06-22: 路线图已把 `Sprint 3` 定义为 `Visible Composer`，并要求 `TanStack Form + Zod` 收口。
  - 2026-06-22: 本 brief 将 `Sprint 3` 收敛为 visible textarea / send / clear / keyboard semantics cutover，不把 visible slash autocomplete UI 或 provider transport 混入。
  - 2026-06-22: 当前代码已交付 React-owned visible composer；`#send_textarea` / `#send_but` 由 TanStack Form + Zod surface 承载，保留 Enter / Shift+Enter / empty-submit / mobile reachability 语义，并通过 serialized submit 维持 legacy single-submit 规则。
- **Implementation traceability:** roadmap source `.docs/tech/react-modernization-roadmap.md`; delivered code `.docs/logic-description/main_chat_composer_bridge_processing_flow.md`, `public/scripts/main-chat-composer-state.js`, `public/script.js`, `app/workspace-panels.tsx`; owning docs `.docs/db/pages/chat-workspace.md`, `.docs/tech/main-chat-rendering-call-chain.md`; validation surfaces `tests/main-chat-composer-state.test.js`, `tests/chat-message-streaming.e2e.js`, `tests/chat-message-layout.e2e.js`, `tests/react-workspace-panels-helpers.test.js`; delivery status `delivered`

## Non-Goals

- 不在本 Sprint 里迁移 provider transport、token append、`Generate()` owner、`#mes_stop`、`#mes_continue` 或 `.generation_failure_retry`。
- 不在本 Sprint 里迁移 visible slash autocomplete / parser UI；`/` 输入仍可先走 compatibility path。
- 不新增新的 prompt validation 规则、输入长度上限或用户可见错误文案。
- 不暴露 prompt 原文到 hidden marker 或文档数据库。
- 不重写文件附件、工具调用、宏、World Info、Backgrounds 或 Settings。

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/logic-description/main_chat_composer_bridge_processing_flow.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/db/pages/chat-workspace.md`
- `DESIGN.md`
- `public/scripts/main-chat-composer-state.js`
- `public/script.js`
- `app/workspace-panels.tsx`
- `tests/main-chat-composer-state.test.js`
- `tests/chat-message-streaming.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `https://tanstack.com/form/latest/docs/framework/react/guides/validation`
- `https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling`
- `https://tanstack.com/query/latest/docs/framework/react/reference/useMutation`
- `https://zod.dev/basics`
