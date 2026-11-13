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
    - public/scripts/main-chat-greetings.js
    - public/scripts/chat-message-render-service.js
    - public/scripts/chat-message-commands.js
    - public/scripts/chat-message-reasoning-commands.js
    - public/scripts/chat-message-row-commands.js
    - public/scripts/chat-turn-card-projection.js
    - public/scripts/chat-message-render-descriptor.js
    - public/scripts/chats.js
    - public/scripts/external-media-policy.js
    - public/scripts/message-css-policy.js
    - public/scripts/character-external-media-authorization.js
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

- Ownership is published as DOM state, not a config flag: `ensureMainChatMessageListReactHost()` (`public/script.js:2982`) marks `#chat` with `data-react-main-chat-owner="react"` and the composer items with `data-main-chat-composer-owner="react"`; `isReactMainChatOwner()` (`public/script.js:3033`) reads it; `cleanupMainChatMessageListReactHost()` (`public/script.js:3000`) deletes it.
- Rows must stay direct children of `#chat` (`#chat > .mes[mesid]`). No wrapper element is introduced, and turn cards are styling metadata applied to the original siblings rather than a container.
- `buildChatMessageRichBodyRender()` (`public/scripts/chat-message-render-service.js:29`) is the framework-neutral rich-body projection seam: it returns message/reasoning/media/file/bias HTML strings and always reports `insertsDom: false`. It delegates markdown/regex work to the injected `formatMessage`, so `messageFormatting()` (`public/scripts/message-service.js:83`) and `getMessageTextHTML()` (`public/scripts/message-service.js:729`) stay the only markdown/regex/media producers. React consumes that HTML; it does not re-implement formatting.
- `updateMessageElement()` (`public/scripts/message-service.js:830`) and `redisplayChat()` (`public/script.js:5508`) survive only as adapters for the load-earlier insert path and for callers that still need a row element. Neither is a parallel visible owner.
- Message edits, reasoning actions, copies, moves and deletes go through `createChatMessageCommands()` in `public/scripts/chat-message-commands.js`, with `chat` as the compatibility authority and React rendering the refreshed snapshot. React row commands first resolve their object-stable UID against the current chat in `public/scripts/chat-message-row-commands.js`, rejecting stale sessions or removed objects; compatibility callers continue using positions. Structural commands remap transient row UI state with the message positions and schedule a snapshot refresh before awaiting persistence or events. `updateMessageElement()` refuses to populate an existing React-owned row and schedules a snapshot refresh instead. Slash commands are retired.
- Persistence and event ordering depends on the command: `deleteMatching()` awaits save before `MESSAGE_DELETED` and suppresses that event if the chat changed; `deleteFrom()` awaits save before emitting the original start index; `deleteRange()` schedules a debounced save before emitting the final chat length, without awaiting persistence. Reasoning edit and delete commands in `public/scripts/chat-message-reasoning-commands.js` await save before their respective `MESSAGE_REASONING_EDITED` or `MESSAGE_REASONING_DELETED` events and suppress the event if the target is no longer current; unchanged reasoning edits and `setMessageReasoning()` do not emit an edit event. The matching-delete event also reaches the memory subscriber, whose summary reconciliation is exercised by `tests/chat-message-memory-integration.test.js`.
- Stored chat rendering is a bounded window of the newest `CHAT_TRUNCATION` (=100, `public/scripts/constants.js:156`) messages. `power_user.chat_truncation` is retired and stripped on load/save.
- Compatibility-sensitive selectors stay reachable: `.mes`, `.mes[mesid]`, `.mes_text`, `.mes_reasoning_details`, `.mes_reasoning`, `.mes_media_wrapper`, `.mes_file_wrapper`, `.mes_buttons`, image-gallery controls, `#show_more_messages`. Assistant-response swipe generation is retired.
- Message-CSS resource admission is decided during formatting, not at insert time: `messageFormatting()` (`public/scripts/message-service.js:83`) resolves `allowExternalMedia` from the active character once per call via `currentCharacterAllowsExternalMedia()` (`public/scripts/message-service.js:26`), which asks `isCharacterExternalMediaAllowed(state.power_user, state.characters[state.this_chid]?.avatar)` (`public/scripts/external-media-policy.js:16`) against the `power_user.external_media_allowed_overrides` allow-list. That boolean reaches only the CSS passes below. Message-body media is not gated: the gallery/list branches of `appendMediaToMessage()` (`public/scripts/message-service.js:426`) and `buildMediaHtml()` (`public/scripts/chat-message-render-service.js:207`) insert attachment URLs directly, and markdown `src`/`poster`/`srcset` attributes pass through untouched, so images, video, and audio load from any origin.

### Message CSS Filter Chain

`messageFormatting()` (`public/scripts/message-service.js:83`, passes at `:218-:223`) runs three ordered steps after DOMPurify, sharing one scope and one keyframes map:

1. `decodeStyleTags(mes, { prefix, messagePolicy: true, allowExternalMedia, animationScope, animationNames })` (`public/scripts/chats.js:542`) collects the `<custom-style>` keyframes names into the shared `animationNames` map first (only when `animationScope` matches `/^[a-zA-Z0-9_-]+$/`), then filters each parsed declaration with `isMessageCssDeclarationAllowed(property, value, allowExternalMedia)` (`public/scripts/message-css-policy.js:102`, which rejects shorthand expansion that hides a `url()`) and `isolateMessageAnimation()` (`public/scripts/message-css-policy.js:8`). It keeps only `rule`/`media`/`keyframes`/`keyframe`/`comment` nodes, drops selectors starting with `+ ~ >` or containing a backslash, renames `@keyframes` names to `${animationScope}-${name}` while rewriting matching `animation`/`animation-name` values, and returns `''` instead of `CSS ERROR: ...` when parsing fails.
2. `filterMessageInlineStyles(mes, allowExternalMedia, animationNames)` (`public/scripts/message-css-policy.js:109`) rewrites each `[style]` attribute through `sanitizeMessageCssDeclarations()` (`:77`), which drops `--*`, `-webkit-animation*`, values containing a backslash, values the CSSOM cannot parse, and any value failing `safeValue()` (`:21`) — a hand-written scanner that only admits whitelisted functions, requires balanced quotes/parens, and routes every `url()`/`image-set()` argument through `isMediaUrlAllowed()` (`public/scripts/external-media-policy.js:2`, which compares `new URL(...).origin` against the page origin, always allows `data:`, and admits other origins only when `allowExternalMedia` is true). The same pass walks SVG elements and removes any of `fill`, `stroke`, `filter`, `mask`, `clip-path`, `marker`, `marker-start`, `marker-mid`, `marker-end`, `cursor`, `color-profile` whose value fails that check, so `url(#local)` survives while an external or `var()`-indirected target does not.
3. The result is wrapped in `<div data-message-style-scope="${animationScope}">`, and `animationScope` comes from `getMessageStyleScope()` (`public/scripts/message-service.js:31`), a `WeakMap` keyed by the message object (separate `message`/`reasoning` entries) so the scope is stable across re-renders and spliced chats.

`allowExternalMedia` also travels into the projection cache: `buildMainChatSnapshotFromLegacyChat()` (`public/scripts/main-chat-store-projection.js:269`, parameter at `:273`) records it on `lastProjection` and refuses row reuse unless the incoming value matches (`:316`), so toggling the character switch invalidates the cache instead of serving CSS-filtered HTML produced under the previous policy.

The authorization write path is a command port, not a settings field: `setExternalMediaAllowed` in `getCharacterAuthoringReactCommands()` (`public/script.js:2597`, command at `:2601`) delegates to `setCharacterExternalMediaAuthorization()` (`public/scripts/character-external-media-authorization.js`), which rejects a `characterId` that is no longer the active card, rewrites the allow-list, removes the id from `external_media_forbidden_overrides`, saves, and awaits a refresh that calls `invalidateMainChatRenderProjection()` plus `scheduleMainChatMessageListPanelRefresh()`. The React checkbox is rendered only in edit mode (`app/workspace-panels.tsx:1814`) and reverts its own state when the command returns `false`.

## Core Implementation

### Stored Chat Open

1. `selectCharacterById(id, { switchMenu })` (`public/script.js:4682`) updates active character state and calls `getChat()`.
2. `getChat()` (`public/scripts/chat-ops-service.js`) calls `unshallowCharacter()`, then `POST /api/chats/get`; it validates the current session and response version before splicing loaded messages into `state.chat`, normalizes media arrays, restores `chat_metadata`, clears `reactMainChatProjectionCleared`, queues the reading-position snapshot, and calls `getChatResult()`.
3. `getChatResult()` seeds the first message for an empty chat through `getFirstMessage(undefined, { recordGreetingIdentity: true })`, calls `printMessages()`, selects the character, then emits `CHAT_CHANGED` (plus `CHAT_CREATED`, and for a one-message chat `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED`). The recorded `extra.greeting_identity` (`{ index, text, rendered }`) keeps the authored greeting the row came from even when regex or card rendering rewrites the visible text; it is creation-time provenance, not an explicit selection. `getChat()` emits `CHAT_LOADED` afterwards.
4. Itemized prompts are a module-level array read through `hasItemizedPromptForMessage(message, messageId)` (`public/script.js:3186`) when the bridge snapshot is built; there is no per-render lookup step.

Failure modes: `getChat()` checks the captured character, chat, session, and chat reference after asynchronous steps, and refuses to replace the current chat when an unresolved write exists. A failed load before readiness marks that session as failed so conditional saves are blocked; normal loads show a retry notification, while strict reloads propagate the error. A nonempty response without its version is treated as a failure. Empty data follows the first-message or empty-chat path. See [Chat Recovery](../db/features/chat-recovery.md) for local draft and conflict behavior.

### Bridge Snapshot And Row Rendering

1. `printMessages()` (`public/scripts/chat-ops-service.js:191`) clears transient row UI state. On the React path it resets `state.reactMainChatProjectionCleared` to `false`, mounts the panel, and only scrolls to the bottom when no reading-position restore is pending; the legacy path re-appends `#show_more_messages` when the chat is longer than `CHAT_TRUNCATION` and calls `redisplayChat()`.
2. `mountReactMainChatMessageListPanel()` (`public/script.js:3355`) mounts `kind: 'mainChatMessageList'` through `mountWorkspacePanelHost()` with `ensureContainer`, `getState`, and `commands`, then schedules the scroll restore.
3. `getMainChatMessageListReactBridgeState()` assembles the snapshot: `buildMainChatSnapshotFromLegacyChat()` (`public/scripts/main-chat-store-projection.js:271`) over `buildMainChatMessageRecord()` (`public/scripts/main-chat-store-projection.js:55`), plus composer, generation control, streaming transport, row UI state, visible window, turn summaries (`getChatMemoryDisplayItems()`), and greetings. The greeting snapshot (`public/scripts/main-chat-greetings.js`) lists non-empty authored entries, resolves the current entry from `chat_metadata.greeting` and otherwise from `chat[0].extra.greeting_identity`, and reports `canSelect` only when the character is known, at least two greetings exist, metadata is not tainted, and — unless the chat is still empty — `canSwitchGreeting()` accepts the sole row as an untouched, non-streaming, non-editing assistant message.
4. `app/workspace-panels.tsx` renders the snapshot with `useSyncExternalStore`. Each message becomes a direct `#chat` child through `MainChatMessageRow` (`app/components/main-chat/MainChatMessageRow.tsx`), which replays `messageHtml`, reasoning HTML, media, file, and bias fragments into the protected shells and renders recovery status and failure notices as `<output>` elements outside `.mes_text`.
5. Row ownership classification lives in `public/scripts/chat-message-render-descriptor.js`: `classifyChatMessageRendererContract()` (`:113`) returns `{ rendererOwner: 'react', phase7Candidate: 'react-rich-body-owner' }` for every supported row state, differing only in `fallback` — `not-needed` for finalized rows, `preserve-editing-live-content` and `preserve-streaming-live-content` when live content must survive — and returns `unsupported-with-reason` when `.mes_text` is missing or the row is structurally unsafe. `buildMainChatRowLifecycleContract()` (`:177`) records the React message-list controller as the single lifecycle policy owner.

### Turn Cards

`projectChatTurnCards()` (`public/scripts/chat-turn-card-projection.js:60`) assigns one card id plus a `single`/`start`/`middle`/`end` position to the render-ordered entries. A summary entry always opens a card — collapsed summaries open their own single card, expanded summaries open the card carrying the rows they reintroduce (`public/scripts/chat-turn-card-projection.js:36`). A user row opens a card unless it directly follows an expanded summary (`public/scripts/chat-turn-card-projection.js:45`), which is one of the rows that summary reintroduced rather than a new turn. Each card then includes the following tool/result rows and the final answer, and ignores rows hidden by the reply pipeline so hidden rows consume no corner slot. `app/workspace-panels.tsx:2026` builds those entries in exact render order and passes the assignment to `MainChatMessageRow`, which writes `data-turn-card` / `data-turn-card-position`. The styling lives in `public/style.css:6254` and paints the shared surface without moving or cloning content; a turn-summary header shares the same card surface.

### Long Chat Load Earlier

1. `getMainChatReactVisibleWindow()` (`public/script.js:3075`) starts at the saved `mainChatVisibleStartIndices` entry for the chat, otherwise at `max(total - CHAT_TRUNCATION, 0)`, and returns `{ visibleMessageIds, showMoreVisible }`.
2. `#show_more_messages` is rendered by React (`app/workspace-panels.tsx:2072`) with `data-main-chat-windowing-owner="react"` and `data-main-chat-load-more-owner="react"`, and dispatches `commands.loadMoreMessages`.
3. `loadEarlierChatMessages(messagesToLoad = null)` (`public/scripts/chat-ops-service.js:125`) lowers the stored start index by the requested count (default `CHAT_TRUNCATION`), emits `MORE_MESSAGES_LOADED`, and remounts. The legacy branch of the same function still inserts rows before the current first row and compensates `scrollTop` by the scroll-height delta when the load-more control is in view.
4. `showMoreMessages(messagesToLoad = null)` (`public/script.js:5306`) is a compatibility alias that delegates to `loadEarlierChatMessages()`; the React command port maps `loadMoreMessages` onto the same function.

Scrolling: `queueMainChatMessageListScrollRestore()` / `getMainChatMessageListScrollRestoreSnapshot()` / `consumeMainChatMessageListScrollRestore()` (`public/script.js:1541`, `:1572`, `:1554`) keep the reading anchor across remounts, and `scrollChatToBottom()` (`public/scripts/message-service.js:929`) owns the bottom pin.

### User Message Append

`sendTextareaMessage()` (`public/script.js:5650`) guards concurrent send/regenerate entry and calls `Generate('normal')` (`public/script.js:6503`). `sendMessageAsUser()` (`public/script.js:6939`) builds the message, pushes it onto `state.chat`, awaits `saveChatConditional()`, emits `MESSAGE_SENT`, calls `addOneMessage()` (`public/scripts/message-service.js:761`) — which on the React path remounts the panel and scrolls — and then emits `USER_MESSAGE_RENDERED`. The insert-in-middle path splices the message into `state.chat` at its target index, saves, emits `MESSAGE_SENT`, and calls `reloadCurrentChat()` before `USER_MESSAGE_RENDERED`, so it re-renders the list instead of appending one row.

### Streaming Token Path

1. `Generate()` wraps the request in a generation envelope and delegates to `executeGenerationRequestInShell()` (`public/scripts/generation-service.js:418`); attempt planning and recovery decisions belong to [main-chat-generation-lifecycle.md](main-chat-generation-lifecycle.md).
2. When streaming is enabled and the type is not `quiet`, the attempt loop creates `GenerationStreamSession` (`public/scripts/generation-service.js:127`, instantiated at `:1278`) and assigns it to `state.streamingProcessor`.
3. `onStartStreaming()` (`:208`) persists the placeholder reply via `saveReply()`, resolves the row id, and marks the UI as generating.
4. `onProgressStreaming()` (`:217`) cleans the partial text and balances one unclosed trailing Markdown marker — the list is `*`, `"`, a triple-backtick fence, and `~~~` (`public/scripts/generation-service.js:224`) — writes it into `state.chat[messageId]`, updates reasoning, and then branches: on the legacy host it writes `messageFormatting()` output into `.mes_text` and updates the timer; on the React host it only calls `scheduleMainChatMessageListPanelRefresh()` (`public/script.js:1663`) and lets React re-render the row.
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
- `[data-testid="main-chat-greeting-picker"]` and its `[data-greeting-picker-trigger]` button, which `doNewChat()` clicks after the new chat renders unless a greeting is already recorded or the user touched the picker
- `printMessages`, `showMoreMessages`, `addOneMessage`, `updateMessageElement`, `redisplayChat`
- `GenerationStreamSession`, `scheduleMainChatMessageListPanelRefresh`

## Operations, Calculation, And Failure Boundaries

Windowing calculation (reproducible): inputs are the chat length, the saved start index for the chat id, and `CHAT_TRUNCATION` (100). Output is the contiguous `visibleMessageIds` slice plus `showMoreVisible`. Load-earlier reduces the start index by the requested count, clamped at 0; a zero start index means the full chat is visible and the load-more control disappears.

Degradation: `mountWorkspacePanelHost()` (`public/scripts/workspace-panel-host-controller.js`) returns a fallback result carrying one of `bundle-load-failed`, `mount-failed`, `missing-container`, or `feature-disabled` (`public/scripts/workspace-panel-mount-contract.js`). Bundle-load, mount, and React failures display a single `role="alert"` outside the chat scroll area. A successful later mount clears the notice only if it is still the same failure. A message-list render or lifecycle failure can unmount it and does not guarantee preservation of the displayed rows or an unsaved draft. Disabled features and missing containers do not add a notice, and failures do not restore legacy rendering. A broken deployment can be rolled back by deploying a previous version, not by an in-process dual-owner flag. This mount failure is distinct from the stored chat read failure described above.

Focused proof:

```bash
pnpm --dir tests run test:unit external-media-policy.test.js character-external-media-authorization.test.js chat-message-render-service.test.js main-chat-store-projection.test.js --runInBand
pnpm --dir tests run test:e2e message-resource-policy.e2e.js media-direct-loading.e2e.js character-external-media-authorization.e2e.js --workers=1
pnpm --dir tests run test:unit chat-turn-card-projection.test.js chat-message-render-descriptor.test.js react-workspace-panels-helpers.test.js --runInBand
pnpm --dir tests run test:unit chat-message-commands.test.js chat-message-reasoning-commands.test.js --runInBand
pnpm --dir tests run test:integration chat-message-memory-integration.test.js --runInBand
pnpm --dir tests run test:e2e chat-message-layout.e2e.js chat-message-rendering.e2e.js --workers=1
pnpm run test:compat
```

Covered by `tests/chat-turn-card-projection.test.js`, `tests/chat-message-layout.e2e.js`, `tests/chat-message-rendering.e2e.js` (including slow saves and chat switches), `tests/chat-message-commands.test.js`, `tests/chat-message-reasoning-commands.test.js`, `tests/chat-message-memory-integration.test.js`, `tests/chat-message-streaming.e2e.js`, `tests/chat-message-list-walkthrough.e2e.js`, `tests/chat-workspace-structure.test.js`, `tests/chat-message-render-descriptor.test.js`, `tests/external-media-policy.test.js`, `tests/character-external-media-authorization.test.js`, `tests/chat-message-render-service.test.js`, `tests/main-chat-store-projection.test.js`, `tests/message-resource-policy.e2e.js`, `tests/media-direct-loading.e2e.js`, and `tests/character-external-media-authorization.e2e.js`.
