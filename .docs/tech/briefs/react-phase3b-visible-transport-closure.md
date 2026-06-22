---
created: 2026-06-22
source: user
confirmed: true
last_updated: 2026-06-22
---

# React Phase 3B Visible Transport Closure Intent

## User Original Request

用户在确认当前 `Phase 3B` 仍未闭环之后，直接要求：`$delivery-workflow 完成所有 3B开发任务`。

按当前仓库事实，这个请求不会自动落到已存在的可恢复 `spec.md` / `plan.md`，因为 `Phase 3B Sprint 5` 先前只按“第一个可交付切片”完成了 `submitComposer` / `continueLast` 的 React-owned visible transport owner，spec 已在 wrap-up 后删除。

本 brief 的目标是把“完成所有 3B 开发任务”收敛成剩余的最后一个可交付切口：补齐 `Phase 3B Sprint 5` 的 visible transport closure spec，然后再交回 `delivery-workflow`。

## Background & Motivation

当前主聊天 visible owner 的迁移状态已经非常接近闭环：

- safe row renderer、visible message actions shell、visible composer、visible slash autocomplete/status UI 已交付
- React-owned visible transport 已支持 `submitComposer` / `continueLast`
- 但 `retry/regenerate/swipe` 仍在请求级别 fail-closed 回退 legacy，导致最核心的“继续生成之外的可见生成入口”仍然没有被 React transport owner 接住

如果这一段不补齐，路线图和项目历史都只能继续把 `Phase 3B` 标记为“接近完成但未闭环”。

## Intent Domains

### Domain: Phase 3B Sprint 5 visible transport closure

- **User expectation:** 让 `Phase 3B` 真正闭环，而不是只停在 `submitComposer` / `continueLast` 的 first slice。
- **Current status:** delivered on 2026-06-22; standard visible OpenAI direct-chat `submitComposer` / `continueLast` / regenerate / retry / swipe transport closure is complete, while `non-OpenAI` / `group` / `dry-run` / `nested depth` / `quiet/background` remain explicit legacy compatibility paths.
- **Recommended default:** 只补齐标准 visible main-chat OpenAI direct-chat 路径上的 `retryGeneration`、`regenerate`、`swipeLeft`、`swipeRight` transport owner；`non-OpenAI`、`group`、`dry-run`、`nested depth`、`quiet/background` 继续明确保留为 legacy/excluded path，不把它们混进 `Phase 3B` closure。
- **Why this default:** 这是当前路线图和现有代码上最小、最可验证、也最符合既有 non-goals 的 closure slice；如果把 excluded transport paths 一起并入，会把 `Phase 3B` 重新膨胀成一次性大重写。
- **Change history:**
  - 2026-06-22: 用户要求“完成所有 3B开发任务”。
  - 2026-06-22: 核对 `.docs/tech/react-modernization-roadmap.md` 后确认 `Phase 3B Sprint 5` 仅完成 first slice，`retry/regenerate/swipe` 仍未切换到 React visible transport owner。
  - 2026-06-22: 新增本 brief，把剩余交付收敛为 closure spec，而不是重开整段 `Phase 3` / `Phase 3B` 设计。
- **Implementation traceability:** roadmap source `.docs/tech/react-modernization-roadmap.md`; current slice docs `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`, `.docs/tech/main-chat-generation-lifecycle.md`, `.docs/PROJECT_HISTORY.md`; code paths `public/script.js`, `public/scripts/main-chat-visible-transport-owner.js`, `public/scripts/chat-generation-lifecycle.js`, `app/workspace-panels.tsx`; proof surfaces `tests/main-chat-visible-transport-owner.test.js`, `tests/chat-generation-lifecycle.test.js`, `tests/chat-message-streaming.e2e.js`, `tests/react-workspace-panels-helpers.test.js`.
- **Delivery evidence:** `bun run build:react:workspace-panels`; `bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js chat-generation-lifecycle.test.js react-workspace-panels-helpers.test.js --runInBand`; `$env:EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST='true'; bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js --workers=1`; `bun run test:compat`; `bun run docs:check`; `bun run docs:build`; `bun run perf:interaction -- --scenario main_chat_stream_first_token --profile small --repeats 1 --pairs 1 --variant sqlite_on_only`.
- **Wrap-up traceability:** archived in wrap-up commit `feat(react): let visible transport close the loop`.

## Non-Goals

- 不把 `non-OpenAI`、`group`、`dry-run`、`nested depth`、`quiet/background` 路径一起迁到 React transport owner。
- 不重写 provider payload assembly、slash registry/parser、message formatting、storage schema、World Info、Backgrounds、Extensions 或 settings。
- 不把 `Phase 3B` 重新扩成“大主聊天 rewrite”。
- 不在本切口里引入新的 pause/resume 语义或新的 chat data model。

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/briefs/react-phase3b-provider-transport-and-token-append-owner.md`
- `.docs/specs/react-phase3-main-chat/README.md`
- `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/features/chat-generation-auto-recovery.md`
- `.docs/db/features/fallback-provider.md`
- `public/script.js`
- `public/scripts/main-chat-visible-transport-owner.js`
- `public/scripts/chat-generation-lifecycle.js`
- `app/workspace-panels.tsx`
- `tests/main-chat-visible-transport-owner.test.js`
- `tests/chat-generation-lifecycle.test.js`
- `tests/chat-message-streaming.e2e.js`
- `https://tanstack.com/query/latest/docs/framework/react/reference/useMutation`
- `https://tanstack.com/form/latest/docs/framework/react/guides/validation`
- `https://zod.dev/basics`
