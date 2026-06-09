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

## Feature Purpose

This feature lets users reliably read an opened chat history as message rows with faithful message text and stable row identity.

## Trigger Entry

- **Stored chat entry**: open an existing character chat from the workspace.
- **Rendered message entry**: a finalized user or character message appears in the main chat region.
- **Long chat entry**: open a chat whose history is longer than the active visible-message window.
- **Generation failure entry**: a recoverable provider or streaming failure keeps the user message visible, preserves a single assistant row for the failed generation attempt, and lets the workspace recover before falling back to the manual retry CTA.

## Interaction IDs

- `feature.chat_message_rendering`: the overall rendered-message contract.
- `feature.chat_message_rendering.stored_chat`: stored JSONL messages displayed in the main chat region.
- `feature.chat_message_rendering.message_dom`: stable message row selectors and semantic attributes.
- `feature.chat_message_rendering.long_chat_window`: the initial visible window for long chats, the load-more affordance, and row identity preservation after older messages are loaded.

## User Flow

1. The user opens or continues a chat in [Chat Workspace](page.chat_workspace).
2. EmberDesk loads the chat data for the active character or context.
3. EmberDesk renders message rows in `#chat`.
4. The user reads user and character messages from `.mes_text`.
5. If the chat is longer than the visible window, the user can load older messages from the existing load-more entry.
6. After older messages are loaded, EmberDesk keeps the loaded rows and newest rendered row in the same chat DOM without adding a separate return-to-newest control.

## Business Rules And Boundaries

- Message body text is the primary content in each rendered message row.
- Stored user and character messages should render faithfully enough that the visible text matches the source message after normal browser whitespace handling.
- Protected rendered-message selectors include `#chat > .mes`, `.mes_text`, `.mes[mesid]`, `.last_mes`, `is_user`, `is_system`, `.mes_reasoning_details`, `.mes_reasoning`, `.mes_media_wrapper`, `.mes_file_wrapper`, `.swipe_left`, and `.swipe_right`.
- Long chats may render only the recent visible window on first load, but the user must retain an affordance to load older messages. Loading older messages must preserve message row identity without adding a separate return-to-newest recovery entry.
- Recoverable provider or streaming failure must not remove the user message or duplicate assistant rows. If partial assistant text was rendered during an intermediate attempt, it is cleared before automatic recovery continues; only the final success or final failed state remains visible in the stable `.mes[mesid]` row.
- Message-row actions belong to [Chat Message Actions](feature.chat_message_actions). This feature only requires that rendering keeps the row identity those actions attach to.
- Streaming token timing, provider responses, slash-command semantics, and chat-file migrations are outside this feature boundary.
- Automatic retry timing and fallback-provider selection belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).

## ID Boundary Notes

This feature is separate from [Chat Message Actions](feature.chat_message_actions) because reading message text and operating on message controls have different risks and proof surfaces. It is also separate from future streaming-specific behavior because stored chat rendering can be proven without provider requests or token streaming.

## Outcomes

- **Success**: stored or finalized messages appear as readable `.mes_text` inside stable `.mes[mesid]` rows.
- **Long chat state**: the initial DOM stays bounded by the configured visible-message window, exposes the existing load-more entry, and keeps loaded message rows stable after older messages are loaded.
- **Failure recovery state**: generation failure keeps row identity stable through automatic retry, and only the final failed state exposes the manual retry action from the preserved assistant row.
- **Compatibility state**: first-party modules and compatible extensions can keep locating rendered messages through the protected selectors.
