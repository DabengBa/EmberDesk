---
id: feature.chat_message_rendering
type: feature
name: Chat Message Rendering
related: [page.chat_workspace, feature.chat_message_actions, feature.chat_generation_auto_recovery]
---

# Feature: Chat Message Rendering

## ID 解释

`feature.chat_message_rendering` represents the visible message body and stable message-row DOM identity in [Chat Workspace](page.chat_workspace). It covers already-loaded stored messages and finalized generated messages after they are rendered into the conversation surface.

It does not define provider generation, streaming token append, message actions, slash-command parsing, or the chat JSONL storage schema.

## Purpose

Let users reliably read opened chat history and finalized generated messages as stable message rows in [Chat Workspace](page.chat_workspace).

## User-Visible Contract

- Stored and finalized user, assistant, character, or system messages render as readable message rows whose visible text matches the source message after normal browser whitespace handling.
- Message text remains the primary content of each row; reasoning, media, files, bias, swipe state, and row actions may appear around it only when valid for that message.
- Safe finalized rows may be visibly owned by the guarded React message-list path, but they must preserve the same row identity, message text shell, reasoning/media/file shells, action attachment points, and reading flow as the established surface.
- Editing rows, active streaming rows, unsafe snapshot rows, and extension-mutated rows fail closed to the established legacy rendering surface rather than leaving a half-owned row.
- Long chats may open with only the recent visible window, but users must retain the existing load-more affordance for older messages; loaded older rows stay stable without requiring a separate jump-to-newest recovery control.
- Returning to a previously read chat in the same page session may restore the expanded history window and reading region when safe; if not safe, EmberDesk falls back to the normal open result.
- Recoverable visible generation failure must not remove the user message or duplicate assistant rows; final success or final failed state remains on one stable assistant row.

## Semantic Interaction IDs

- `feature.chat_message_rendering`: the overall rendered-message contract.
- `feature.chat_message_rendering.stored_chat`: stored messages displayed in the main chat region.
- `feature.chat_message_rendering.message_dom`: stable message row identity and compatibility surfaces.
- `feature.chat_message_rendering.long_chat_window`: the initial visible window for long chats, load-more affordance, and row preservation after older messages load.

## Acceptance Workflows

- As a chat user who wants to read an existing conversation, from [Chat Workspace](page.chat_workspace) open a stored chat; EmberDesk must show readable message rows with stable user/assistant/system identity and faithful message text, refresh or reopen must not garble, duplicate, or reorder messages, and failure is missing text, wrong speaker identity, or broken row identity for actions.
- As a user reading a long chat, from a chat longer than the visible window use the load-more affordance for older messages and continue reading; EmberDesk must keep newly loaded and previously visible rows stable, returning to the chat in the same page session may restore the earlier reading region when safe, and failure is losing the reading position, duplicating rows, or requiring a new jump-to-newest control to recover.
- As a user receiving a finalized generated reply, from send, continue, regenerate, retry, or swipe flows wait for the row to settle; EmberDesk must finalize content in a single assistant row, fallback unsupported paths to the established surface, and after refresh/reopen show one coherent final or failed row, with failure signaled by duplicate transport rows, stale partial content, or half-React/half-legacy row shells.
- As a user with extension-mutated or editing rows, from a chat containing those rows reopen or update the chat; EmberDesk must preserve a coherent legacy-rendered row rather than a broken migrated row, and failure is lost extension content, missing message text, or action hooks attached to a row that no longer has stable identity.

## Feature-Specific Evidence

- Readable message text, speaker/row identity, reasoning/media/file visibility, load-more behavior, reading-position restore, single assistant row after generation, and coherent fallback rendering are primary evidence.
- Protected selectors such as `#chat > .mes`, `.mes_text`, `.mes[mesid]`, `.last_mes`, `is_user`, `is_system`, reasoning/media/file wrappers, and swipe controls are compatibility evidence only when the visible row remains correct.
- Hidden visible-transport, quiet-transport, windowing, and row-lifecycle markers are diagnostic evidence for owner decisions; they do not replace visible row proof.
- Legacy formatter snapshots and React replay boundaries support proof only when they preserve the same rendered message body.

## Failure Signals

- Stored messages render with missing, duplicated, reordered, or wrong-speaker rows.
- Long-chat load-more loses row identity or reading position.
- A finalized generation creates more than one assistant row for one request.
- Unsafe, editing, streaming, or extension-mutated rows render as mixed broken owner surfaces.
- Protected message surfaces disappear while row actions or compatible extensions still depend on them.

## Boundaries

- Message-row controls belong to [Chat Message Actions](feature.chat_message_actions).
- Automatic retry timing and fallback-provider selection belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- The chat workspace shell and navigation context belong to [Chat Workspace](page.chat_workspace).
- Provider responses, streaming token timing, slash-command semantics, chat-file migrations, and storage schema are outside this feature.
