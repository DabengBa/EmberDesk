---
id: feature.chat_message_rendering
type: feature
name: Chat Message Rendering
related: [page.chat_workspace, feature.chat_message_actions]
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
- **Generation failure entry**: a provider or streaming failure leaves a user message and, when partial assistant text exists, one readable assistant row in the main chat region.

## Interaction IDs

- `feature.chat_message_rendering`: the overall rendered-message contract.
- `feature.chat_message_rendering.stored_chat`: stored JSONL messages displayed in the main chat region.
- `feature.chat_message_rendering.message_dom`: stable message row selectors and semantic attributes.
- `feature.chat_message_rendering.long_chat_window`: the initial visible window for long chats, the load-more affordance, and the jump-to-latest recovery entry after older messages are loaded.

## User Flow

1. The user opens or continues a chat in [Chat Workspace](page.chat_workspace).
2. EmberDesk loads the chat data for the active character or context.
3. EmberDesk renders message rows in `#chat`.
4. The user reads user and character messages from `.mes_text`.
5. If the chat is longer than the visible window, the user can load older messages from the existing load-more entry.
6. After older messages are loaded, the user can use the jump-to-latest entry to return to the newest rendered message without changing row identity.

## Business Rules And Boundaries

- Message body text is the primary content in each rendered message row.
- Stored user and character messages should render faithfully enough that the visible text matches the source message after normal browser whitespace handling.
- Protected rendered-message selectors include `#chat > .mes`, `.mes_text`, `.mes[mesid]`, `.last_mes`, `is_user`, `is_system`, `.mes_reasoning_details`, `.mes_reasoning`, `.mes_media_wrapper`, `.mes_file_wrapper`, `.swipe_left`, and `.swipe_right`.
- Long chats may render only the recent visible window on first load, but the user must retain an affordance to load older messages and, after doing so, a recovery entry to jump back to the latest message.
- Provider or streaming failure must not remove the user message or duplicate an empty assistant row. If partial assistant text was rendered, it remains attached to a single stable `.mes[mesid]` row.
- Message-row actions belong to [Chat Message Actions](feature.chat_message_actions). This feature only requires that rendering keeps the row identity those actions attach to.
- Streaming token timing, provider responses, slash-command semantics, and chat-file migrations are outside this feature boundary.

## ID Boundary Notes

This feature is separate from [Chat Message Actions](feature.chat_message_actions) because reading message text and operating on message controls have different risks and proof surfaces. It is also separate from future streaming-specific behavior because stored chat rendering can be proven without provider requests or token streaming.

## Outcomes

- **Success**: stored or finalized messages appear as readable `.mes_text` inside stable `.mes[mesid]` rows.
- **Long chat state**: the initial DOM stays bounded by the configured visible-message window, exposes the existing load-more entry, and shows jump-to-latest after older messages are loaded.
- **Failure recovery state**: generation failure keeps existing message text readable and row identity stable so the composer or message-row recovery action can continue from the failed context.
- **Compatibility state**: first-party modules and compatible extensions can keep locating rendered messages through the protected selectors.
