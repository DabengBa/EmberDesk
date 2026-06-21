# Main Chat Streaming Transport Bridge Processing Flow

## Metadata

- Owner: main-chat streaming transport bridge documentation
- Current code bindings: `public/scripts/main-chat-streaming-transport-state.js`, `public/script.js`, `app/workspace-panels.tsx`
- Related semantic docs: [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md), [.docs/db/features/chat-message-rendering.md](../db/features/chat-message-rendering.md), [.docs/db/features/chat-generation-auto-recovery.md](../db/features/chat-generation-auto-recovery.md)
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)

## Goals And Non-Goals

Goals:

- Document how legacy streaming facts become the hidden React `streamingTransport` bridge payload.
- Preserve the boundary between observing transport/token state and owning provider requests or token append.
- Record terminal snapshot replay for fast stop/completion/error cleanup.

Non-goals:

- Replace `sendStreamingRequest()`, provider routing, `StreamingProcessor.generate()`, or `.mes_text` token append.
- Add React-owned SSE/EventSource transport.
- Define provider pause/resume.

## Input Discovery And Parsing Rules

`public/script.js` builds the bridge payload from legacy facts:

1. `document.body.dataset.generating` reports visible generation activity.
2. `streamingProcessor` reports active message id, finalizing/stopped/finished flags, observed token/chunk counts, fallback-attempt state, and error-recovery state while the processor still exists.
3. `.generation_auto_recovery_status`, `.generation_failure_retry`, and `.generation_failure_notice` provide recovery, retry, and final failure context after the processor may have been cleared.
4. User stop records a terminal `stopped` snapshot before tail cleanup can return the visible shell to idle.

The pure classifier in `public/scripts/main-chat-streaming-transport-state.js` receives only plain metadata. It does not mutate DOM, send requests, append tokens, or persist chat data.

## Outputs

The bridge output is `streamingTransport` inside `mainChatMessageList` state:

```json
{
  "phase": "idle|connecting|streaming|finalizing|stopped|completed|error",
  "activeMessageId": 12,
  "hasStreamingProcessor": true,
  "observedTokenCount": 8,
  "observedChunkCount": 8,
  "fromFallbackAttempt": false,
  "recoverable": true,
  "errorLabel": null
}
```

React validates the payload with Zod in `app/workspace-panels.tsx`. Invalid or missing payloads fall back to idle and do not affect visible legacy UI.

Hidden marker attributes include:

- `data-main-chat-streaming-transport-phase`
- `data-main-chat-streaming-transport-tokens`
- `data-main-chat-streaming-transport-message-id`
- `data-main-chat-streaming-transport-fallback`

## Staged Processing Flow

1. Legacy generation starts through `Generate()` and creates a `StreamingProcessor` for streaming attempts.
2. The processor increments observed token/chunk counters while legacy `.mes_text` remains the visible append target.
3. `getMainChatStreamingTransportBridgeState()` reads processor and recovery DOM facts and normalizes them through `getMainChatStreamingTransportState()`.
4. Terminal phases `stopped`, `completed`, and `error` are cached in `globalThis.__emberDeskMainChatStreamingTransportStore.latestTerminalSnapshot`.
5. If a tail refresh sees `idle`, or a transient `connecting` state without an active processor, the bridge replays the latest terminal snapshot instead of losing stop/error/completion evidence.
6. A new real active processor clears the previous terminal snapshot.
7. React validates the snapshot and writes only hidden controller markers.

## Key Rules

- Visible assistant rows stay `#chat > .mes[mesid]`.
- Token text stays in legacy `.mes_text`.
- User stop records `stopped` and never starts automatic recovery.
- Fallback attempts can set `fromFallbackAttempt=true`; fallback status text stays outside `.mes_text`.
- Terminal replay is observational only. It does not keep generation active or affect provider cleanup.
- Schema failure, flag-off state, or bundle failure returns to legacy behavior.

## Verification

Focused proof:

```powershell
bun run --cwd tests test:unit -- chat-streaming-control-state.test.js react-workspace-panels-helpers.test.js --runInBand
$env:EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST='true'; bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js
```

The browser proof covers success stream, stop, fallback recovery, final failure retry, pre-token failure, and mobile stop/retry reachability without real provider keys.
