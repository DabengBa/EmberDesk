# Main Chat Streaming Transport Bridge Processing Flow

## Metadata

- Owner: main-chat streaming transport bridge documentation
- Current code bindings: `public/scripts/main-chat-streaming-transport-state.js`, `public/script.js`, `app/workspace-panels.tsx`
- Related semantic docs: [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md), [.docs/db/features/chat-message-rendering.md](../db/features/chat-message-rendering.md), [.docs/db/features/chat-generation-auto-recovery.md](../db/features/chat-generation-auto-recovery.md)
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)

## Goals And Non-Goals

Goals:

- Document the current split between the hidden `streamingTransport` bridge payload and the supported React-owned visible transport slice.
- Preserve the boundary between supported React-owned standard visible direct-chat transport and the remaining legacy fallback transport paths.
- Record terminal snapshot replay for fast stop/completion/error cleanup on legacy-owned requests.

Non-goals:

- Replace `sendStreamingRequest()`, provider routing, or the entire `Generate()` compatibility entry point.
- Move quiet/background generation or non-OpenAI/group/dry-run/nested paths into the React-owned transport slice.
- Define provider pause/resume.

## Input Discovery And Parsing Rules

`public/script.js` now has two related responsibilities:

1. classify whether a visible request can enter the React-owned transport slice
2. continue building the hidden bridge payload from legacy facts for fallback requests and diagnostics

Legacy bridge facts still come from:

1. `document.body.dataset.generating` reports visible generation activity.
2. `streamingProcessor` reports active message id, finalizing/stopped/finished flags, observed token/chunk counts, fallback-attempt state, and error-recovery state while the processor still exists.
3. `.generation_auto_recovery_status`, `.generation_failure_retry`, and `.generation_failure_notice` provide recovery, retry, and final failure context after the processor may have been cleared.
4. User stop records a terminal `stopped` snapshot before tail cleanup can return the visible shell to idle.

The pure legacy classifier in `public/scripts/main-chat-streaming-transport-state.js` still receives only plain metadata. It does not mutate DOM, send requests, append tokens, or persist chat data.

`public/scripts/main-chat-visible-transport-owner.js` owns the supported-request classifier for the visible React transport slice:

- `submitComposer`, `continueLast`, `retryGeneration`, `swipeLeft`, and `swipeRight` are currently eligible
- `mainApi` must be `openai`
- selected group, dry-run, and nested-visible generation fail closed to legacy
- quiet/background and other excluded compatibility requests fail closed per request instead of locking the whole chat surface

The Phase 4A support matrix is explicit:

| Path | Support classification | Current owner |
|---|---|---|
| Standard OpenAI visible direct-chat `submitComposer` / `continueLast` / `retryGeneration` / `swipeLeft` / `swipeRight` | `react-owned` | React visible transport mutation |
| Non-OpenAI provider | `legacy-fallback` | Legacy `Generate()` / provider transport |
| Group chat | `legacy-fallback` | Legacy group generation flow |
| Dry run | `legacy-fallback` | Legacy prompt assembly / no visible assistant-row owner |
| Nested visible generation | `legacy-fallback` | Legacy recursive generation guard |
| Quiet generation | `legacy-fallback` | Legacy quiet/background-compatible path |
| Background generation | `legacy-fallback` | Legacy background-compatible path |
| Unknown visible generation kind | `unsupported-with-reason` | No React owner; request must not partially enter React transport |

`classifyMainChatVisibleTransportSupport()` returns the matrix status, path, and reason. `classifyMainChatVisibleTransportOwner()` remains a backward-compatible adapter that maps `react-owned` to `owner: "react"` and all other statuses to `owner: "legacy"`.

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

During a supported React-owned visible request, the hidden controller also reports:

- `data-main-chat-visible-transport-owner="react"`
- `data-main-chat-visible-transport-kind="submitComposer|continueLast|retryGeneration|swipeLeft|swipeRight"`

After the supported request settles, the controller returns to `legacy` observation mode for future idle or unsupported requests.

Hidden marker attributes include:

- `data-main-chat-streaming-transport-phase`
- `data-main-chat-streaming-transport-tokens`
- `data-main-chat-streaming-transport-message-id`
- `data-main-chat-streaming-transport-fallback`

## Staged Processing Flow

1. A visible generation intent starts from the React-owned composer, continue button, regenerate button, failed-row retry CTA, or swipe controls.
2. `public/script.js` calls `prepareVisibleGeneration` and uses `classifyMainChatVisibleTransportOwner()` to decide whether the request is supported by the current React-owned transport slice.
3. Supported visible direct-chat requests enter the React mutation in `app/workspace-panels.tsx`, which owns request sequencing, visible token append, stop/error/completed transport state, bounded retry/fallback state, and assistant-row finalization for that request.
4. Excluded visible or non-visible compatibility paths fail closed back to legacy `Generate()` / `StreamingProcessor`.
5. For legacy-owned requests, `getMainChatStreamingTransportBridgeState()` still reads processor and recovery DOM facts and normalizes them through `getMainChatStreamingTransportState()`.
6. Legacy terminal phases `stopped`, `completed`, and `error` are cached in `globalThis.__emberDeskMainChatStreamingTransportStore.latestTerminalSnapshot`.
7. If a legacy tail refresh sees `idle`, or a transient `connecting` state without an active processor, the bridge replays the latest terminal snapshot instead of losing stop/error/completion evidence.
8. A new real active legacy processor clears the previous terminal snapshot.
9. React validates either the live React-owned runtime state or the legacy bridge snapshot and writes the hidden controller markers.

## Key Rules

- Visible assistant rows stay `#chat > .mes[mesid]`.
- For supported React-owned `submitComposer`, `continueLast`, `retryGeneration`, `swipeLeft`, and `swipeRight` requests, token text may append through the React-owned visible transport runtime, but it must still stay on the same assistant row and preserve the same final row identity. `retryGeneration` covers both the top-level regenerate button and the failed-row retry entry.
- Excluded compatibility paths keep token text in the ordinary legacy `.mes_text` path.
- User stop still records `stopped` and never starts automatic recovery.
- Fallback attempts can set `fromFallbackAttempt=true`; fallback status text stays outside `.mes_text`.
- Terminal replay is observational only. It does not keep generation active or affect provider cleanup.
- Schema failure, unsupported request classification, flag-off state, or bundle failure returns that request to legacy behavior.

## Verification

Focused proof:

```powershell
bun run build:react:workspace-panels
bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js react-workspace-panels-helpers.test.js chat-generation-lifecycle.test.js chat-streaming-control-state.test.js --runInBand
$env:EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST='true'; bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js --workers=1
```

The browser proof covers supported React-owned send/continue/regenerate/retry/swipe transport, excluded-path legacy fallback, stop, fallback recovery, final failure retry, pre-token failure, and mobile stop/retry reachability without real provider keys.
