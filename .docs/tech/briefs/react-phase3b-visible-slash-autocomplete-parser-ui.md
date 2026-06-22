---
created: 2026-06-22
source: user
confirmed: true
last_updated: 2026-06-22
---

# React Phase 3B Visible Slash Autocomplete Parser UI Intent

## User Original Request

用户要求继续按 `Phase 3B` 的 visible-owner 路线，把 `Sprint 2-5` 分别收敛成可交付 spec。路线图已将 `Sprint 4` 定义为 `Visible Slash Autocomplete And Parser UI`。

## Background & Motivation

当前仓库已经有 hidden `slashCommand` bridge：React 能观察 slash active、query length、autocomplete visible、executing、paused、aborted 和 error label，但可见的 slash query parsing、autocomplete DOM、selection/hint UX 和 paused/error surface 仍由 legacy `public/scripts/slash-commands.js` 及其 `AutoComplete` 路径拥有。

用户要的是把 visible owner 真正切到 React，而不是继续停留在 hidden marker；同时又不能打散现有 parser、registry、execution、pause/continue/abort controller 和 `@sillytavern/*` 兼容面。

## Intent Domains

### Domain: Phase 3B Sprint 4 visible slash autocomplete and parser UI

- **User expectation:** 在 React-owned visible composer 基线上，把主聊天 slash 的 visible parsing / autocomplete / selection / paused / error UI 收到 React；registry / executor 可以暂经 compatibility adapter，但 visible UI owner 不再回到 legacy。
- **Current status:** delivered
- **Change history:**
  - 2026-06-22: 用户要求为 `Phase 3B Sprint 2-5` 分别补齐 spec。
  - 2026-06-22: 路线图已把 `Sprint 4` 定义为 `Visible Slash Autocomplete And Parser UI`。
  - 2026-06-22: 本 brief 明确 `Sprint 4` 不是重写整个 slash-command 子系统，而是迁 visible chat-input slash UI owner。
  - 2026-06-22: 当前代码已交付 React-owned visible slash autocomplete / parser UI；autocomplete、selection、paused / aborted / error status UI 切到 React，可见执行继续通过 legacy parser / registry / executor / compatibility export 链路完成。
- **Implementation traceability:** roadmap source `.docs/tech/react-modernization-roadmap.md`; delivered code `.docs/logic-description/main_chat_slash_command_bridge_processing_flow.md`, `public/scripts/main-chat-slash-command-state.js`, `public/scripts/slash-commands.js`, `public/script.js`, `app/workspace-panels.tsx`; current proof surfaces `tests/main-chat-slash-command-state.test.js`, `tests/third-party-extension-compatibility.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/chat-message-streaming.e2e.js`; delivery status `delivered`

## Non-Goals

- 不在本 Sprint 里重写 `SlashCommandParser`、command registry、`executeSlashCommandsOnChatInput()` 或 `SlashCommandAbortController`。
- 不迁移 provider transport、token append、message row renderer 或 message actions。
- 不把宏 autocomplete、Prompt Manager、expanded editors 或其他非主聊天输入框的 autocomplete 一起迁入本 Sprint。
- 不改变 `@sillytavern/scripts/slash-commands` 兼容导出、regex placement 或第三方扩展 API。

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/specs/react-phase3-main-chat/README.md`
- `.docs/logic-description/main_chat_slash_command_bridge_processing_flow.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/pages/chat-workspace.md`
- `DESIGN.md`
- `public/scripts/main-chat-slash-command-state.js`
- `public/scripts/slash-commands.js`
- `public/scripts/autocomplete/AutoComplete.js`
- `public/script.js`
- `app/workspace-panels.tsx`
- `tests/main-chat-slash-command-state.test.js`
- `tests/third-party-extension-compatibility.test.js`
- `tests/chat-message-streaming.e2e.js`
- `https://tanstack.com/form/latest/docs/framework/react/guides/validation`
- `https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling`
- `https://zod.dev/basics`
