---
id: feature.chat_memory
type: feature
name: Chat Memory (Turn Summarization)
related: [page.chat_workspace, page.settings, feature.fallback_provider, feature.prompt_inspector]
---

# Feature: Chat Memory (Turn Summarization)

## ID 解释

`feature.chat_memory` is the opt-in conversation-round summarization system on the chat-completions (`openai`) backend. Older turns are compressed into background-generated summaries that mask the original messages during prompt assembly, while the canonical `chat` array and every original message row are preserved untouched. It does not cover retrieval/RAG memory, cross-chat memory, or writing summaries into World Info.

## Purpose

Keep long chats prompt-affordable without losing continuity: recent turns stay verbatim, older turns collapse into per-turn summaries, and the user can always expand a summary back to the real messages it covers.

## User-Visible Contract

- The feature is off by default; enabling the "历史会话轮次总结" toggle on the Providers tab of [Settings](page.settings) activates it for chats on the chat-completions backend.
- The newest N closed turns (default 5, configurable "保留完整显示的最近轮数") always stay verbatim; older closed turns are summarized in the background.
- A summarized turn renders in the main chat list as a compact summary card ("第 X 轮 · 已摘要") at the turn's original position; expanding the card reveals the covered original message rows with full view/edit/regenerate affordances.
- Deleting or otherwise removing newer verbatim turns automatically expands older summarized turns back to original display so the newest N complete turns are always shown.
- Editing, hiding/unhiding, or regenerating any covered message invalidates its summary (content fingerprint drift) and schedules background regeneration; until a fresh summary exists the turn falls back to sending raw text. Pinning a covered message instead locks the whole turn verbatim — the summary stays but is never applied while pinned.
- The opening leading group (greetings before the first user message) is never auto-summarized; pinned messages lock their entire turn verbatim and never participate in summarization.
- Prompt assembly replaces covered messages in position with a wrapped pseudo message (`【早前剧情回顾】` default wrap, configurable), injected with the configurable role (system default).
- The Prompt Inspector lists summarized turns in a dedicated "已摘要轮次" section, distinct from budget-dropped entries, and marks summary wire entries with `chatSummary-turn-N` identifiers.
- Summary generation runs on the background model (`fallback_provider_model`, labeled 后台模型) and falls back to the primary model when unset; requests are minimal two-message side-channel calls — never `Generate('quiet')` — forced non-streaming, tool-calls disabled, serialized behind the foreground generation.
- Summaries persist under `chat_metadata.chat_memory`; creating a branch carries over only summary records whose covered messages all survive into the branch.

## Semantic Interaction IDs

- `feature.chat_memory.toggle`: enabling or disabling the summarization feature.
- `feature.chat_memory.keep_turns`: changing how many recent closed turns stay verbatim.
- `feature.chat_memory.card.expand`: expanding or collapsing a turn summary card in the main chat list.
- `feature.chat_memory.pin`: pinning a message to lock its whole turn verbatim.
- `feature.chat_memory.consolidate_now`: manually triggering an immediate consolidation pass (`getContext().chatMemory.runImmediateConsolidation()`).

## Acceptance Workflows

- As a user with memory enabled in a chat longer than the verbatim window, send a message and inspect the next request in the Prompt Inspector; older turns must appear as wrapped summary entries with `chatSummary-turn-N` identifiers and the summarized section must list them, and failure is the covered originals still occupying prompt budget.
- As a user reviewing history, expand a summary card in the main chat list; the covered original rows must render as ordinary message rows (view/edit/regenerate), and failure is a read-only or duplicated rendering.
- As a user who deletes the newest turn, observe the list and the next prompt; the oldest summarized turns must automatically expand so N newest complete turns show verbatim, and failure is permanently collapsed history.
- As a user who edits a summarized message, expand the card, edit, then observe the summary badge marked stale and a regeneration scheduled; until regenerated the turn must be sent verbatim, and failure is a stale summary silently masking new content.

## Feature-Specific Evidence

- `chat_metadata.chat_memory.summaries` records carry `turnKey`, covered `messageIds`, `contentHash`, `status`, and per-content-version retry counts.
- The summary card and Inspector summarized section are the direct user-visible proofs; canonical chat rows must remain byte-identical.

## Failure Signals

- A summary write lands for a chat or content version other than the one it was generated for (CAS violation).
- Canonical message rows are mutated to render or inject a summary.
- A stale summary continues masking edited/deleted covered content.
- Background summarization emits generation lifecycle events, uses tools, or blocks a foreground send.
- World Info scans summarized-away original text (ghost triggers) instead of the replaced sequence.

## Boundaries

- Writing extracted facts/timelines into World Info is explicitly out of scope.
- The memory panel, handwritten notes, and usage-bar visualization are planned follow-up phases, not part of this feature yet.
- Background model field semantics belong to [Fallback Provider](feature.fallback_provider); prompt entry inspection belongs to [Prompt Inspector](feature.prompt_inspector).
