---
description: Maps each main-chat user journey (stored open, row rendering, turn cards, load-earlier, send, streaming finalize) to the current React-owned call chain, so a renderer change can be traced from the bridge snapshot to the direct #chat children.
kind: technical
topic: main-chat-rendering
relations:
  requires:
    - tech/third-party-extension-compatibility.md
  related:
    - tech/main-chat-generation-lifecycle.md
code:
  paths:
    - public/script.js
    - public/scripts/chat-ops-service.js
    - public/scripts/message-service.js
    - public/scripts/main-chat-store-projection.js
    - public/scripts/chat-message-render-service.js
    - public/scripts/chat-turn-card-projection.js
    - public/scripts/chat-message-render-descriptor.js
    - public/scripts/generation-service.js
    - app/workspace-panels.tsx
    - app/components/main-chat/
---

# Main Chat Rendering Call Chain

## Scope

- **Owner:** main-chat message list rendering, row output, turn-card grouping, long-chat windowing, and the streaming row update path inside `#chat`.
- **Authoritative for:** how a stored chat, a sent message, and a streamed reply become visible direct-child rows; which layer owns that output at each step.
- **Excludes:** product semantics (`.docs/db/`), generation command/recovery policy ([main-chat-generation-lifecycle.md](main-chat-generation-lifecycle.md)), the third-party-facing selector contract ([third-party-extension-compatibility.md](third-party-extension-compatibility.md)), and provider payload builders.

## Responsibility

React is the sole runtime owner of the visible main-chat message list. `public/script.js` keeps the bridge that builds the snapshot, the command port that React calls back into, and compatibility adapters such as `printMessages()`, `showMoreMessages()`, `redisplayChat()`, and `addOneMessage()`.

The legacy formatter and row builder still produce the row data and rich-body HTML; React replays that output into the legacy shells. There is no second renderer stack and no product flag that restores a dual-owner list.

## Architecture And Constraints

- Ownership is published as DOM state, not a config flag: `ensureMainChatMessageListReactHost()` (`public/script.js:2846`) marks `#chat` with `data-react-main-chat-owner="react"` and the composer items with `data-main-chat-composer-owner="react"`; `isReactMainChatOwner()` (`public/script.js:3003`) reads it; `cleanupMainChatMessageListReactHost()` (`public/script.js:2967`) deletes it.
- Rows must stay direct children of `#chat` (`#chat > .mes[mesid]`). No wrapper element is introduced, and turn cards are styling metadata applied to the original siblings rather than a container.
- `buildChatMessageRichBodyRender()` (`public/scripts/chat-message-render-service.js:28`) is the framework-neutral rich-body projection seam: it returns message/reasoning/media/file/bias HTML strings and always reports `insertsDom: false`. It delegates markdown/regex work to the injected `formatMessage`, so `messageFormatting()` (`public/scripts/message-service.js:64`) and `getMessageTextHTML()` (`public/scripts/message-service.js:701`) stay the only markdown/regex/media producers. React consumes that HTML; it does not re-implement formatting.
- `updateMessageElement()` (`public/scripts/message-service.js:796`) and `redisplayChat()` (`public/script.js:5394`) survive only as adapters for the load-earlier insert path and for callers that still need a row element. Neither is a parallel visible owner.
- Stored chat rendering is a bounded window of the newest `CHAT_TRUNCATION` (=100, `public/scripts/constants.js:156`) messages. `power_user.chat_truncation` is retired and stripped on load/save.
- Compatibility-sensitive selectors stay reachable: `.mes`, `.mes[mesid]`, `.mes_text`, `.mes_reasoning_details`, `.mes_reasoning`, `.mes_media_wrapper`, `.mes_file_wrapper`, `.mes_buttons`, swipe controls, `#show_more_messages`.

## Core Implementation

### Stored Chat Open

1. `selectCharacterById(id, { switchMenu })` (`public/script.js:4629`) updates active character state and calls `getChat()`.
2. `getChat()` (`public/scripts/chat-ops-service.js:488`) calls `unshallowCharacter()`, then `POST /api/chats/get`; it splices the loaded messages into `state.chat`, normalizes media arrays, restores `chat_metadata`, clears `reactMainChatProjectionCleared`, queues the reading-position snapshot, and calls `getChatResult()`.
3. `getChatResult()` (`public/script.js:7455`) seeds the first message for an empty chat, calls `printMessages()`, selects the character, then emits `CHAT_CHANGED` (plus `CHAT_CREATED`, and for a one-message chat `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED`). `getChat()` emits `CHAT_LOADED` afterwards.
4. Itemized prompts are a module-level array read through `hasItemizedPromptForMessage(message, messageId)` (`public/script.js:3155`) when the bridge snapshot is built; there is no per-render lookup step.

Failure modes: a failed fetch still falls through to `getChatResult()` and logs the error, so the visible chat is stale rather than absent; empty or missing chat data produces first-message or empty-chat behavior instead of a distinct error surface.

### Bridge Snapshot And Row Rendering

1. `printMessages()` (`public/scripts/chat-ops-service.js:191`) clears transient row UI state. On the React path it resets `state.reactMainChatProjectionCleared` to `false`, mounts the panel, and only scrolls to the bottom when no reading-position restore is pending; the legacy path re-appends `#show_more_messages` when the chat is longer than `CHAT_TRUNCATION` and calls `redisplayChat()`.
2. `mountReactMainChatMessageListPanel()` (`public/script.js:3355`) mounts `kind: 'mainChatMessageList'` through `mountWorkspacePanelHost()` with `ensureContainer`, `getState`, and `commands`, then schedules the scroll restore.
3. `getMainChatMessageListReactBridgeState()` (`public/script.js:3107`) assembles the snapshot: `buildMainChatSnapshotFromLegacyChat()` (`public/scripts/main-chat-store-projection.js:269`) over `buildMainChatMessageRecord()` (`public/scripts/main-chat-store-projection.js:55`), plus composer, generation control, streaming transport, slash UI, row UI state, visible window, turn summaries (`getChatMemoryDisplayItems()`), and greetings.
4. `app/workspace-panels.tsx` renders the snapshot with `useSyncExternalStore`. Each message becomes a direct `#chat` child through `MainChatMessageRow` (`app/components/main-chat/MainChatMessageRow.tsx`), which replays `messageHtml`, reasoning HTML, media, file, and bias fragments into the protected shells and renders recovery status and failure notices as `<output>` elements outside `.mes_text`.
5. Row ownership classification lives in `public/scripts/chat-message-render-descriptor.js`: `classifyChatMessageRendererContract()` (`:113`) returns `{ rendererOwner: 'react', phase7Candidate: 'react-rich-body-owner' }` for every supported row state, differing only in `fallback` — `not-needed` for finalized rows, `preserve-editing-live-content` and `preserve-streaming-live-content` when live content must survive — and returns `unsupported-with-reason` when `.mes_text` is missing or the row is structurally unsafe. `buildMainChatRowLifecycleContract()` (`:177`) records the React message-list controller as the single lifecycle policy owner.

### Turn Cards

`projectChatTurnCards()` (`public/scripts/chat-turn-card-projection.js:60`) assigns one card id plus a `single`/`start`/`middle`/`end` position to the render-ordered entries. A card opens at a user row or an expanded summary header, includes the following tool/result rows and the final answer, and ignores rows hidden by the reply pipeline so hidden rows consume no corner slot. `app/workspace-panels.tsx:2026` builds those entries in exact render order and passes the assignment to `MainChatMessageRow`, which writes `data-turn-card` / `data-turn-card-position`. The styling lives in `public/style.css:6254` and paints the shared surface without moving or cloning content; a turn-summary header shares the same card surface.

### Long Chat Load Earlier

1. `getMainChatReactVisibleWindow()` (`public/script.js:3045`) starts at the saved `mainChatVisibleStartIndices` entry for the chat, otherwise at `max(total - CHAT_TRUNCATION, 0)`, and returns `{ visibleMessageIds, showMoreVisible }`.
2. `#show_more_messages` is rendered by React (`app/workspace-panels.tsx:2072`) with `data-main-chat-windowing-owner="react"` and `data-main-chat-load-more-owner="react"`, and dispatches `commands.loadMoreMessages`.
3. `loadEarlierChatMessages(messagesToLoad = null)` (`public/scripts/chat-ops-service.js:125`) lowers the stored start index by the requested count (default `CHAT_TRUNCATION`), emits `MORE_MESSAGES_LOADED`, and remounts. The legacy branch of the same function still inserts rows before the current first row and compensates `scrollTop` by the scroll-height delta when the load-more control is in view.
4. `showMoreMessages(messagesToLoad = null)` (`public/script.js:5245`) is a compatibility alias that delegates to `loadEarlierChatMessages()`; the React command port maps `loadMoreMessages` onto the same function (`public/script.js:3268`), so slash-command, welcome-prompt, and UI callers share one path.

Scrolling: `queueMainChatMessageListScrollRestore()` / `getMainChatMessageListScrollRestoreSnapshot()` / `consumeMainChatMessageListScrollRestore()` (`public/script.js:1490`, `:1521`, `:1503`) keep the reading anchor across remounts, and `scrollChatToBottom()` (`public/scripts/message-service.js:929`) owns the bottom pin.

### User Message Append

`sendTextareaMessage()` (`public/script.js:5587`) guards concurrent send/regenerate entry and calls `Generate('normal')` (`public/script.js:6423`). `sendMessageAsUser()` (`public/script.js:6856`) builds the message, saves it, emits `MESSAGE_SENT`, appends it to `state.chat`, calls `addOneMessage()` (`public/scripts/message-service.js:732`) — which on the React path remounts the panel and scrolls — and emits `USER_MESSAGE_RENDERED`. Insert-in-middle edits go through `reloadCurrentChat()` instead.

### Streaming Token Path

1. `Generate()` wraps the request in a generation envelope and delegates to `executeGenerationRequestInShell()` (`public/scripts/generation-service.js:418`); attempt planning and recovery decisions belong to [main-chat-generation-lifecycle.md](main-chat-generation-lifecycle.md).
2. When streaming is enabled and the type is not `quiet`, the attempt loop creates `GenerationStreamSession` (`public/scripts/generation-service.js:127`, instantiated at `:1278`) and assigns it to `state.streamingProcessor`.
3. `onStartStreaming()` (`:208`) persists the placeholder reply via `saveReply()`, resolves the row id, and marks the UI as generating.
4. `onProgressStreaming()` (`:217`) cleans and brace-balances the partial text, writes it into `state.chat[messageId]`, updates reasoning, and then branches: on the legacy host it writes `messageFormatting()` output into `.mes_text` and updates the timer; on the React host it only calls `scheduleMainChatMessageListPanelRefresh()` (`public/script.js:1612`) and lets React re-render the row.
5. `finalizeIntermediaryMessage()` (`:285`) mounts the panel, runs the final progress pass, finishes reasoning, attaches images, emits `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED`, and remounts; `onFinishStreaming()` (`:323`) then saves the chat. `onErrorStreaming()` (`:329`) and `onStopStreaming()` (`:348`) keep the partial text, restore controls, and remount without entering the streaming path again.
6. Streaming transport phase facts are produced by `getMainChatStreamingTransportState()` (`public/scripts/main-chat-streaming-transport-state.js:33`) and published as `data-main-chat-streaming-transport-*` diagnostics; that helper explicitly owns no provider request, token append, or DOM.

Failure modes: stop must leave the composer/stop controls consistent; provider errors must leave a readable row plus a recovery affordance instead of duplicated or vanished partial text.

### Finalized Character Message

Finalization runs through the same row builder as a stored message: `state.chat` is authoritative, the React row re-renders from the new record, and action affordances come from `feature.chat_message_actions`. Changing row structure or classes can break first-party actions and extension-adjacent scripts, so `pnpm run test:compat` is part of the change gate.

## Related Product Semantics And Binding Points

Semantic IDs:

- `page.chat_workspace`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`

Stable binding points:

- `#chat` with `data-react-main-chat-owner="react"`
- `#chat > .mes[mesid]`, `.mes_text`, `.mes_reasoning_details`, `.mes_media_wrapper`, `.mes_file_wrapper`
- `#chat > .mes[data-turn-card][data-turn-card-position]`, `#chat > .turn-summary-row[data-turn-card]`
- `#show_more_messages` with `data-main-chat-windowing-owner="react"`
- `printMessages`, `showMoreMessages`, `addOneMessage`, `updateMessageElement`, `redisplayChat`
- `GenerationStreamSession`, `scheduleMainChatMessageListPanelRefresh`

## Operations, Calculation, And Failure Boundaries

Windowing calculation (reproducible): inputs are the chat length, the saved start index for the chat id, and `CHAT_TRUNCATION` (100). Output is the contiguous `visibleMessageIds` slice plus `showMoreVisible`. Load-earlier reduces the start index by the requested count, clamped at 0; a zero start index means the full chat is visible and the load-more control disappears.

Degradation: if the React panel fails to mount, the surface fails closed visibly instead of silently restoring a legacy list; rollback is previous-version deploy, not an in-process dual-owner flag.

Focused proof:

```bash
pnpm --dir tests run test:unit -- chat-turn-card-projection.test.js chat-message-render-descriptor.test.js react-workspace-panels-helpers.test.js --runInBand
pnpm --dir tests run test:e2e -- chat-message-layout.e2e.js chat-message-rendering.e2e.js --workers=1
pnpm run test:compat
```

Covered by `tests/chat-turn-card-projection.test.js`, `tests/chat-message-layout.e2e.js`, `tests/chat-message-rendering.e2e.js`, `tests/chat-message-streaming.e2e.js`, `tests/chat-message-list-walkthrough.e2e.js`, `tests/chat-workspace-structure.test.js`, and `tests/chat-message-render-descriptor.test.js`.
