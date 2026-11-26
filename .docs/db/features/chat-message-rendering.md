---
id: feature.chat_message_rendering
type: feature
name: Chat Message Rendering
related: [page.chat_workspace, feature.chat_message_actions, feature.chat_generation_auto_recovery]
---

# Feature: Chat Message Rendering

## ID 解释

`feature.chat_message_rendering` represents the visible message body and stable message-row identity in [Chat Workspace](page.chat_workspace). It covers already-loaded stored messages and finalized generated messages after they appear in the conversation. It does not define response generation, composer submission, or storage details.

## Purpose

Let users reliably read opened chat history and finalized generated messages as stable message rows in [Chat Workspace](page.chat_workspace).

## User-Visible Contract

- First-party frontend cards appear only after message generation finishes; while the message is arriving, its source remains visible instead of showing a partial card.
- Stored and finalized user, assistant, character, or system messages render as readable rows whose visible text matches the source message after normal browser whitespace handling.
- Message text remains the primary content of each row; reasoning, media, files, bias, and row actions may appear around it only when valid for that message.
- Italic emphasis in messages and reasoning uses the surrounding text's font family, including fallback fonts.
- Each rendered user turn reads as one continuous visual card: the user message, every subsequent message row including successful or failed tools and pipeline cards, and the response stay in their original order and keep their own identities while sharing one surface. In a partial window, rows preceding the first rendered user message are not assigned to an inferred turn.
- The card's rounded ends belong to its first and last visible rows: rows hidden by the reply pipeline paint no surface and never claim a corner. A fragment cut off mid-turn still reads as one card whose first rendered row carries the top corner. Expanded turn-summary headers are the card's head rather than a separate card; a collapsed summary renders as its own card until its rows appear.
- The turn card is a background and corner treatment only: batch-selection highlighting, row hover, focus, message actions, and streaming updates keep showing on their own source rows, and a selected row stays visibly selected.
- Media in message bodies — images, video, audio, links, and gallery attachments — loads from the URL authored in the message and is not restricted by the character's CSS authorization.
- Declarative message CSS is confined to its own row: it cannot reach into other rows, import remote stylesheets, or create animations that collide with identically named animations elsewhere. An unparsable style block is discarded without showing an error string in the message.
- External resources referenced by declarative message CSS are admitted only from the page origin, embedded data, or an origin authorized for the active character. The per-character external CSS authorization in Character Authoring governs only those message styles; it does not gate media in the message body or frontend cards. Older grants without a stable character identity must be enabled again.
- Stored chat history opens as one complete, ordered conversation. Older chats, saved searches, recovery, and loading earlier messages preserve message order, swipes, metadata, readable content, and attachment paths rather than replacing the opened chat with a narrower or paginated view.
- Each message keeps an identity that is stable for the current session across message edits, reordering, and deletion of earlier rows; deleting an earlier message must not remount or rewrite the bodies of surviving rows.
- Long chats may open with only the recent visible window, but the load-more affordance for older messages remains available and loaded rows stay stable. Returning to a previously read chat in the same page session may restore the expanded history and reading region when safe; otherwise EmberDesk falls back to the normal open result.
- Recoverable visible generation failure must not remove the user message or duplicate assistant rows; final success or final failed state remains on one stable assistant row.
- Eligible finalized message code blocks containing complete HTML can appear as isolated frontend cards inside the message body. Card scripts run without access to the host page or its features, card buttons can copy plain text on a click, cards grow with their content, and scrollable areas defined by the card scroll inside it. Streaming, editing, error, and over-depth rows do not run cards. Turning frontend cards off or making a row ineligible restores the original code block. Ordinary code collapse remains a separate setting.

## Semantic Interaction IDs

- `feature.chat_message_rendering`: the overall rendered-message contract.
- `feature.chat_message_rendering.stored_chat`: stored messages displayed in the main chat region.
- `feature.chat_message_rendering.message_dom`: stable message row identity and compatibility surfaces.
- `feature.chat_message_rendering.long_chat_window`: the initial visible window for long chats, load-more affordance, and row preservation after older messages load.
- `feature.chat_message_rendering.frontend_frames`: isolated HTML cards in eligible finalized rows.
- `feature.chat_message_rendering.message_media_policy`: message-CSS resource admission for one rendered row — external `url()`/`image-set()` targets and SVG presentation resources are denied unless the active character's authorization is on — plus per-message style and animation scoping.

## Acceptance Workflows

- As a chat user who wants to read an existing conversation, from [Chat Workspace](page.chat_workspace) open a stored chat; EmberDesk must show readable message rows with stable speaker identity and faithful message text, refresh or reopen must not garble, duplicate, or reorder messages, and failure is missing text, wrong speaker identity, or broken row identity for actions.
- As a user reading a long chat, use the load-more affordance for older messages and continue reading; EmberDesk must keep newly loaded and previously visible rows stable, returning to the chat in the same page session may restore the earlier reading region when safe, and failure is losing the reading position, duplicating rows, or requiring a new jump-to-newest control.
- As a user receiving a finalized generated reply, from send, continue, regenerate, or retry flows wait for the row to settle; EmberDesk must finalize content in a single assistant row and after refresh/reopen show one coherent final or failed row, with failure signaled by duplicate rows, stale partial content, or remounted row shells.
- As a user with editing rows, reopen or update the chat; EmberDesk must keep a coherent row with preserved in-flight content, and failure is lost content, missing message text, or actions attached to a row that no longer has a stable identity.
- As a user whose card ships custom message CSS pointing at an external image, open that character's chat with authorization off, then enable `Allow external CSS resources for this character` in Character Authoring; EmberDesk must keep that CSS resource blocked (page-origin and embedded data targets still work) until the checkbox is on, then load it immediately without a reload, keep the change on that character and off every other character, and failure is a request to the denied target before authorization, a resource that only appears after a reload, or a switch that changes another character.
- As a user viewing a finalized HTML card, confirm it grows with its content, its own scrollable areas work, and a button copies plain text; scripts in the card must not reach the host page, and turning frontend cards off or making the row ineligible must show the original code block.

## Failure Signals

- Stored messages render with missing, duplicated, reordered, or wrong-speaker rows.
- Long-chat load-more loses row identity or reading position.
- A finalized generation creates more than one assistant row for one request.
- Editing or streaming rows lose their identity or show mixed row states.
- Frontend cards appear on streaming, editing, error, or over-depth rows, or card scripts can reach host page features.
- Message CSS still triggers a request to a denied external target, two rows' identically named animations interfere, or a character switch leaves the previous character's CSS resources admitted.
- Message-body images, video, or audio are gated on the character authorization, silently dropped, or replaced with a placeholder instead of the authored URL.
- An authorization change needs a reload, applies to a different character than the one whose checkbox was toggled, or disappears after restarting EmberDesk.

## Boundaries

- Message-row controls belong to [Chat Message Actions](feature.chat_message_actions).
- Automatic retry timing and fallback-provider selection belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- The chat workspace shell and navigation context belong to [Chat Workspace](page.chat_workspace).
- The per-character authorization control itself belongs to [Character Library Panel](feature.character_library_panel); this feature owns only what the authorization changes in a rendered row.
- Creator's Notes styling keeps its own long-standing per-card authorization and cannot be granted through the message-CSS setting.
- Provider responses, streaming token timing, composer submission, and chat-file migrations are outside this feature.
