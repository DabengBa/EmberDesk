# Main Chat Rendering Call Chain

## Module Responsibility

This document maps main-chat user journeys to current rendering and streaming call chains. It is an implementation map for future successor slices and does not change product semantics.

## Protected Product Context

Message rendering is owned semantically by:

- `page.chat_workspace`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`

Compatibility-sensitive DOM and event surfaces are recorded in `.docs/tech/third-party-extension-compatibility.md`.

## Core Call Chain

### Stored Chat Open

User journey: user opens an existing character chat and waits for readable messages.

Current path:

1. `selectCharacterById(id)` updates active character state and calls `getChat()`.
2. `getChat()` calls `unshallowCharacter(this_chid)` and `POST /api/chats/get`.
3. `getChat()` updates `chat_metadata`, replaces `chat`, ensures media arrays, then calls `getChatResult()`.
4. `getChatResult()` may add the first message for empty chats, calls `loadItemizedPrompts(getCurrentChatId())`, calls `printMessages()`, then `select_selected_character(this_chid)`.
5. `getChatResult()` emits `CHAT_CHANGED`; fresh chats emit `CHAT_CREATED`; single first-message chats emit `MESSAGE_RECEIVED` and `CHARACTER_MESSAGE_RENDERED`.
6. `getChat()` emits `CHAT_LOADED` after successful load.

Primary user-visible wait: `POST /api/chats/get` plus `printMessages()` and DOM insertion.

Current proof:

- `tests/chat-message-rendering.e2e.js` opens seeded chat through `openCharacterChat()`, waits for `.mes_text`, records `first-message-visible-ms`, and validates stored text fidelity.

Failure modes:

- Fetch failure falls into `getChat()` catch, still calls `getChatResult()`, and logs the error.
- Empty or missing chat data can produce first-message or empty-chat behavior rather than a distinct visible error.

### Message List Rendering

User journey: loaded chat history appears as stable message rows.

Current path:

1. `printMessages()` computes a `startIndex` from `power_user.chat_truncation`.
2. `printMessages()` calls `redisplayChat({ startIndex, fade: false })`.
3. `redisplayChat()` clears or updates the message list and calls `addOneMessage()` for messages in range.
4. `addOneMessage()` creates or inserts a message element and delegates row population to `updateMessageElement()`.
5. `updateMessageElement()` owns row identity, role flags, name/avatar presentation, swipes, reasoning, media/file wrappers, and `.mes_text`.
6. `getMessageTextHTML()` and `messageFormatting()` produce rendered message body HTML.

Primary compatibility boundary:

- `#chat > .mes`
- `.mes_text`
- `.mes[mesid]`
- `.mes_reasoning_details`
- `.mes_reasoning`
- `.mes_media_wrapper`
- `.mes_file_wrapper`
- `.swipe_left`
- `.swipe_right`

Current proof:

- `tests/chat-workspace-structure.test.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-message-render-descriptor.test.js`

Failure modes:

- Moving formatter logic can affect markdown, regex, comments, system messages, reasoning, and extension-visible HTML.
- Row identity changes can break first-party actions and extension-adjacent scripts.

### Current Rich-Body Owner Contract

`public/scripts/chat-message-render-descriptor.js` now records the current rich-body, row-lifecycle, and long-chat windowing contracts, and `public/script.js` plus `app/workspace-panels.tsx` apply the approved cutover for safe finalized rows without introducing a second renderer stack. `buildChatMessageRenderDescriptor()` and `buildChatMessageRowPopulation()` still describe stable row metadata. `classifyChatMessageRendererContract()` now classifies the current owner state as:

- safe finalized rows with `.mes_text` are `react-rich-body-owner`
- extension-mutated rows, editing rows, and streaming rows are `legacy-fallback-required`
- missing `.mes_text` or unsafe rows are `unsupported-with-reason`

For the approved safe finalized row family, the legacy formatter path still produces the validated rich-body snapshot, but React is now the final visible owner that replays `messageHtml`, reasoning, media, file, and bias HTML into the protected legacy shells inside the existing `.mes_block`. This keeps one visible owner per approved row without forking Markdown, code-highlight, LaTeX, media, or file rendering logic.

Rows with extension-owned mutation markers such as `.mes_streaming`, `.TH-streaming`, or `.TH-render` fail closed back to the legacy owner so `JS-Slash-Runner` and similar third-party mutations are not silently swallowed by the React rich-body path.

`buildMainChatRowLifecycleContract()` now records the remaining non-finalized or excluded row families under one explicit current-code policy instead of an implicit mixed owner:

- the React message-list controller is the single lifecycle policy owner
- editing rows, active streaming rows, structurally unsafe rows, and extension-mutated rows remain on explicit legacy facades
- hidden controller markers now publish the row-lifecycle owner plus the editing/streaming/unsafe/extension fallback owners for diagnostics and compatibility proof

### Long Chat Show More

User journey: user opens a long chat, sees the recent bounded window, and loads earlier messages.

Current path:

1. `printMessages()` starts at `chat.length - power_user.chat_truncation` when truncation is active.
2. `showMoreMessages(messagesToLoad = null)` calculates additional earlier messages to load.
3. `showMoreMessages()` inserts the earlier message slice before the current first rendered row by calling `updateMessageElement()` for each loaded message.
4. If the load-more button is in view, `showMoreMessages()` adjusts `#chat` scrollTop using the scroll-height delta so the current reading anchor remains coherent.

Current proof:

- `tests/chat-message-rendering.e2e.js` creates a long-chat fixture, sets `chat_truncation`, opens the long chat, verifies `#show_more_messages`, verifies bounded row count, verifies the first rendered `mesid`, clicks load-more, verifies older seeded rows appear, verifies the previous anchor row remains within an 8px position tolerance, and verifies the latest row remains reachable.
- `buildMainChatWindowingContract()` now records the React message-list controller as the single windowing policy owner, freezes reading-position restore onto the React path, and keeps the actual `showMoreMessages()` execution path as the explicit `legacy-show-more-messages-facade` with `loadMoreOwner: legacy` until a later algorithm cutover is proven.

UX gap:

- Search, jump-to-message, range indicators, and context summaries remain future UX candidates. The current proof covers bounded rendering, load-more position stability, and latest-row reachability without a separate return-to-newest control.

### Retirement Gate

The current code has these explicit owner boundaries. They are the baseline for final-wave retirement, not its completed state:

- safe finalized rows are the only approved React rich-body owner class
- editing rows, streaming rows, extension-mutated rows, unsafe rows, and rows missing `.mes_text` still keep explicit legacy ownership
- `.mes_text`, `.mes[mesid]`, `.mes_reasoning_details`, `.mes_media_wrapper`, `.mes_file_wrapper`, swipe controls, and visible action shell reachability keep compatibility proof
- long-chat windows preserve direct-child `.mes[mesid]` order, `#show_more_messages` reachability, reading-position restore, and mobile load-more access
- the hidden controller records `data-main-chat-windowing-*` and `data-main-chat-row-lifecycle-*` markers so the final fallback split is auditable instead of implicit
- [ADR-0012](../adr/0012-react-migrated-surface-legacy-retirement.md) permits removal only when React covers every listed row family and long-chat algorithm while these proof gates remain green; same-version legacy fallback is not the release rollback mechanism

### User Message Append

User journey: user sends a message and sees it appear in the conversation.

Current path:

1. Send handlers update `chat` with the user message.
2. `addOneMessage()` appends or inserts the row.
3. The path emits `MESSAGE_SENT` and `USER_MESSAGE_RENDERED`.

Current proof:

- Main-chat send-form structure is covered by `tests/chat-workspace-structure.test.js`.
- User-message timing evidence is covered by `main_chat_send_local_echo` in `scripts/interaction-performance-runner.mjs` and documented in `.docs/tech/main-chat-performance-evidence.md`.

Failure modes:

- The user may not know whether send was accepted if local echo timing regresses.
- Duplicate listener binding can duplicate actions or message append side effects.

### Finalized Character Message

User journey: AI response finishes and becomes an ordinary rendered message row.

Current path:

1. Generation code builds response text and message data.
2. Non-streaming finalized paths call `addOneMessage()` / `updateMessageElement()`.
3. Finalized character messages emit `MESSAGE_RECEIVED` and `CHARACTER_MESSAGE_RENDERED`.

Current proof:

- Stored character messages are covered by `tests/chat-message-rendering.e2e.js`.
- Live provider finalization is not part of the current baseline.

Failure modes:

- Final row can lose action affordance if row structure or classes change.
- Formatting changes can alter text fidelity or extension-visible content.

### Streaming Token Path

User journey: AI response streams token by token, user may stop generation, final row should remain stable.

Current path:

1. `Generate()` asks `public/scripts/chat-generation-lifecycle.js` whether the visible request should use the bounded automatic recovery plan.
2. `Generate()` captures an existing-row recovery baseline for `continue` and `swipe` before attempts mutate the current assistant row.
3. For supported visible `submitComposer` / `continueLast` requests, `public/script.js` prepares a React-owned visible transport request and `app/workspace-panels.tsx` runs the active transport mutation for streaming state, token append, and final row completion on that same assistant row.
4. Unsupported visible kinds and excluded paths still fall back to `StreamingProcessor` in `public/script.js`, which owns streaming state and DOM updates for those attempts.
5. Streaming receives token chunks and emits `STREAM_TOKEN_RECEIVED`.
6. Completion paths emit `MESSAGE_RECEIVED` and `CHARACTER_MESSAGE_RENDERED`.
7. Stop and abort paths restore generation controls according to current send/stop state rules and do not enter automatic recovery.
8. Recoverable failures clear or restore the active attempt row through the lifecycle decision, then either retry, fall back once, or expose the existing manual retry CTA.

Current proof:

- `tests/chat-message-streaming.e2e.js` records deterministic local browser proof for successful streaming and user stop recovery with a Playwright-only fetch stub.
- `tests/chat-message-streaming.e2e.js` also proves the current supported React-owned visible transport slice for send/continue and legacy fallback for unsupported direct generation.
- `tests/chat-generation-lifecycle.test.js` records unit proof for visible-generation attempt planning, fallback readiness, finalization, baseline decisions, and quiet/background exclusions.
- `scripts/interaction-performance-runner.mjs` records `main_chat_stream_first_token` and `main_chat_stream_stop_to_usable` scenarios for user-perceived timing evidence.

Failure modes:

- Stop may leave controls in the wrong state.
- Partial output may duplicate or vanish.
- Provider errors may not have a readable recovery path.

## Deferred High-Risk Boundaries

Do not start extraction with:

- `messageFormatting()`
- `getMessageTextHTML()`
- `StreamingProcessor`
- slash-command parser or injected message semantics
- regex placement or markdown sanitizer behavior
- extension mount points or `@sillytavern/*` aliases

These surfaces need dedicated proof before behavior changes.

## Safer Extraction Candidates

Candidate 1: stored message descriptor helper.

- Scope: derive message row descriptor fields from existing message/context data.
- Reason: can be pure and unit tested.
- Guard: rendered DOM and `.mes_text` must remain unchanged.

Candidate 2: message action controller boundary.

- Scope: root-scoped delegated event binding for a low-risk action set.
- Reason: event ownership can be tested without changing markup.
- Guard: role/name and protected selectors must remain stable.

Candidate 3: long-chat proof expansion.

- Scope: E2E proof for load-more and position stability.
- Reason: improves regression signal without changing rendering strategy.
- Guard: no truncation threshold or virtualization change.

Candidate 4: interaction performance evidence.

- Scope: runner/report fields for user-perceived timings.
- Reason: supports future claims with repeatable evidence.
- Guard: no hard KPI or production hook unless separately justified.

## Related Files

- `public/script.js`
- `public/scripts/events.js`
- `tests/chat-workspace-structure.test.js`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-render-descriptor.test.js`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/third-party-extension-compatibility.md`
