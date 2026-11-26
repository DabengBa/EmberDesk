---
id: feature.chat_memory
type: feature
name: Chat Memory (Turn Summarization)
related: [page.chat_workspace, page.settings, feature.fallback_provider, feature.prompt_inspector]
---

# Feature: Chat Memory (Turn Summarization)

## ID 解释

`feature.chat_memory` is the default-on conversation-round summarization system for chat completions. Older turns are compressed into background-generated summaries that replace the original messages in later requests, while every original message row is preserved. It does not cover retrieval-style memory, cross-chat memory, or writing summaries into World Info.

## Purpose

Keep long chats affordable without losing continuity: recent turns stay verbatim, older turns collapse into per-turn summaries, and the user can always expand a summary back to the real messages it covers.

## User-Visible Contract

### Delivery boundary

Turn summarization, summary cards, Inspector integration, global Settings controls, and the current-chat panel are available. The panel provides chat-local settings, turn actions, and bounded execution history.

- The feature is on by default for chats using chat completions. The "历史会话轮次总结" control on the Providers tab of [Settings](page.settings) can disable it; an explicitly saved off setting and chat-local overrides remain in effect.
- The newest N closed turns (default 5, configurable "保留完整显示的最近轮数") always stay verbatim; older closed turns are summarized in the background.
- A summarized turn appears in the main chat list as a compact summary card ("第 X 轮 · 已摘要") at the turn's original position; expanding the card reveals the covered original message rows with full view/edit/regenerate options.
- Deleting or otherwise removing newer verbatim turns automatically expands older summarized turns back to original display so the newest N complete turns are always shown.
- Editing, hiding/unhiding, or regenerating any covered message invalidates its summary and schedules background regeneration; until a fresh summary exists the turn falls back to sending raw text. Pinning a covered message instead locks the whole turn verbatim — the summary stays but is never applied while pinned.
- The opening leading group (greetings before the first user message) is never auto-summarized; pinned messages lock their entire turn verbatim and never participate in summarization.
- Later requests replace covered messages in position with summary text (`【早前剧情回顾】` default wrapper, configurable). With an active [Reply Pipeline](feature.reply_pipeline), only retained summaries are combined into one chronological background-history entry; messages not replaced by summaries remain separate. Otherwise the summary entry appears with the configurable role (system default).
- The Prompt Inspector lists summarized turns in a dedicated "已摘要轮次" section, distinct from budget-dropped entries.
- Summary generation uses the configured 后台模型 and falls back to the primary model when unset; it runs serially behind visible generation without streaming or tools and never appears as a visible reply.
- Creating a branch carries over only summaries whose covered messages all survive into the branch.

### Current-chat panel

- Open `对话记忆` from the chat-options menu, at the same level as `链路日志`. It is scoped only to the conversation currently open, not a Settings tab or a cross-chat manager.
- The panel has `管理`, `设置` and `历史` views. Opening it without a supported persistent conversation shows a warning instead of an editable panel. Turns without summaries and an empty history have their own empty states.
- Settings inherit global defaults from [Settings](page.settings) until overridden for this chat. Values show `继承全局设置`, `当前会话覆盖` or `尚未应用`; applying changes affects only this chat. Per-field `恢复默认` removes that override and uses the current global default, without changing other unapplied fields, global settings, summaries, pins, or history.
- Applying settings shows a pending state and disables duplicate actions. Failure retains the draft and shows an error for retry. Success clears the applied draft and updates the displayed source; there is no separate saved-success banner. Closing with unapplied changes requires confirmation. Switching chats closes the panel, discards the draft, and notifies the user.
- The panel lists turns with their original-text/pinned, summarized, pending, generating, stale, or failed state as applicable. Summary text is read-only. Users may inspect original messages, re-summarize one eligible turn, retry only failed turns, or pin/unpin original text for the whole turn. These controls do not edit or delete source messages; pinned turns are not summarized. Pinning avoids summary substitution, not the model's context limit.
- Background work uses the configured 后台模型, otherwise the primary model, on the same connection as [Settings](page.settings). Busy or unavailable actions explain their state and prevent duplicate execution; a failed summary keeps original text available for sends.
- Execution history belongs only to this chat, survives reopening after a successful save, and keeps at most the latest 50 entries. It shows operation, turn identifier, time, outcome, and a generic failure message when present; model information and cancellation records are not shown. Source text, summary prompts, request/response bodies, and raw errors are not part of this history. It is separate from [Wire Log](feature.wire_log) and does not change Wire Log's capture policy. A failed save does not create a durable history entry.
- Switching chats closes the panel and clears the old chat's transient selection and draft; the user is notified if a draft was discarded. Late results must never appear in or save to the newly opened chat. A new branch may retain eligible summaries but starts with no execution history.

## Semantic Interaction IDs

- `feature.chat_memory.toggle`: enabling or disabling the summarization feature.
- `feature.chat_memory.keep_turns`: changing how many recent closed turns stay verbatim.
- `feature.chat_memory.card.expand`: expanding or collapsing a turn summary card in the main chat list.
- `feature.chat_memory.pin`: pinning a message to lock its whole turn verbatim.
- `feature.chat_memory.consolidate_now`: manually triggering an immediate consolidation pass (`getContext().chatMemory.runImmediateConsolidation()`).

Panel interaction IDs:

- `feature.chat_memory.panel.open`: opening the current-chat panel from chat options.
- `feature.chat_memory.settings.override`: saving a current-chat override.
- `feature.chat_memory.settings.inherit`: removing that override to inherit global defaults.
- `feature.chat_memory.turn.resummarize`: re-summarizing one eligible turn.
- `feature.chat_memory.failed.retry`: retrying failed turns only.
- `feature.chat_memory.history.view`: inspecting this chat's bounded execution history.

## Acceptance Workflows

- From chat options, open `对话记忆`, change a setting and apply it; reopen the conversation to confirm the override persists. Use `恢复默认` to resume global inheritance. On save failure, the draft remains available for retry and no success banner appears.
- In `管理`, re-summarize an eligible turn, retry a failed turn, or pin its originals; inspect `历史` after reopening. Switching chats during a request must close the panel without showing the old result in the next chat; discarding a draft must produce a notification.
- As a user with memory enabled in a chat longer than the verbatim window, send a message and inspect the next request in [Prompt Inspector](feature.prompt_inspector); older turns must appear as summary entries and the summarized section must list them, and failure is the covered originals still occupying the request.
- As a user reviewing history, expand a summary card in the main chat list; the covered original rows must render as ordinary message rows with view/edit/regenerate, and failure is a read-only or duplicated rendering.
- As a user who deletes the newest turn, observe the list and the next request; the oldest summarized turns must automatically expand so the newest N complete turns show verbatim, and failure is permanently collapsed history.
- As a user who edits a summarized message, expand the card, edit, then observe the summary badge marked stale and regeneration scheduled; until regenerated the turn must be sent verbatim, and failure is a stale summary silently masking new content.

## Failure Signals

- A summary is attached to the wrong chat or to content that has since changed.
- Original message rows are replaced or changed to render a summary.
- A stale summary continues masking edited or deleted covered content.
- Background summarization appears as a visible reply, uses tools, or blocks a foreground send.
- Greetings or pinned turns are summarized.
- The panel shows history or results from a different chat, or keeps more than 50 entries.
- A failed summary leaves original text unavailable for a send.

## Boundaries

- Writing extracted facts or timelines into World Info is out of scope.
- Summary editing, handwritten-note editing, summary deletion, and usage-bar visualization are not provided. Original messages are inspected through main-chat summary cards, not an original-message viewer inside the panel.
- The 后台模型 field belongs to [Fallback Provider](feature.fallback_provider); prompt entry inspection belongs to [Prompt Inspector](feature.prompt_inspector).
