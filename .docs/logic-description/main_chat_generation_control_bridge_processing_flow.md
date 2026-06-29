# Main Chat Generation Control Bridge Processing Flow

## Metadata

- Owner: main-chat generation-control bridge documentation
- Current code bindings: `public/scripts/chat-streaming-control-state.js`, `public/script.js`, `app/workspace-panels.tsx`
- Related semantic docs: [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md), [.docs/db/features/chat-generation-auto-recovery.md](../db/features/chat-generation-auto-recovery.md), [.docs/db/features/chat-message-actions.md](../db/features/chat-message-actions.md), [.docs/db/features/chat-message-rendering.md](../db/features/chat-message-rendering.md)
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)

## Goals And Non-Goals

Goals:

- Document the current rules that turn legacy main-chat generation facts into the hidden React `generationControl` bridge payload.
- Make the state priority, metadata normalization, schema fallback, and hidden marker output reproducible without importing production code.
- Record the boundary between observing generation-control state and owning visible stop, continue, retry, transport, or token append behavior.

Non-goals:

- Re-document `Generate()`, `StreamingProcessor`, provider request routing, or token append internals.
- Define provider stream pause/resume. This bridge does not model pause/resume.
- Replace the browser E2E proofs for stop, retry, auto-recovery, row identity, or mobile reachability.

## Input Discovery And Parsing Rules

The legacy bridge reads current browser facts from `public/script.js`:

1. `document.body.dataset.generating === 'true'` reports active visible generation.
2. `streamingProcessor` reports whether a stream exists, is stopped, or is finished.
3. `#chat > .mes .generation_auto_recovery_status` reports active automatic recovery, its visible status label, and its structured `data-recovery-stage`.
4. `#chat > .mes .generation_failure_retry` reports the final retry affordance.
5. `#chat > .mes .generation_failure_notice` reports the final failure notice.
6. `#mes_continue` actual element visibility reports whether the legacy continue surface is currently available.
7. The active message id is resolved from the nearest `#chat > .mes[mesid]` for recovery or retry elements, then falls back to `streamingProcessor.messageId` when it is a non-negative integer.

The pure classifier in `public/scripts/chat-streaming-control-state.js` receives only booleans, strings, and an optional message id. It does not inspect DOM, mutate UI, send provider requests, append tokens, or dispatch actions.

## Outputs

The bridge output is `generationControl` inside the existing `mainChatMessageList` bridge state:

```json
{
  "state": "idle|streaming|recovering|stopped|completed|error",
  "phase": "idle|streaming|recoveringPrimary|recoveringFallback|stopped|completed|error",
  "composerDisabled": "boolean",
  "sendVisible": "boolean",
  "stopVisible": "boolean",
  "continueVisible": "boolean",
  "continueSurface": "hidden|legacy",
  "canRecoverInput": "boolean",
  "activeMessageId": "non-negative integer or null",
  "recoveryStatusLabel": "string or null",
  "failureRetryVisible": "boolean",
  "failureNoticeVisible": "boolean"
}
```

React validates the payload with a Zod schema in `app/workspace-panels.tsx`. If validation fails or the payload is absent, React uses an idle fallback and keeps legacy UI as the visible owner.

The only React-visible output in this sprint is a hidden controller marker:

- `data-main-chat-generation-control-phase`
- `data-main-chat-generation-control-retry`

## Staged Processing Flow

1. Legacy main-chat code updates visible generation surfaces through existing owners: stop button, body generating marker, recovery status row, failure notice, retry button, and continue visibility.
2. `getMainChatGenerationControlBridgeState()` reads the current legacy facts.
3. `getStreamingControlState()` normalizes metadata:
   - `activeMessageId` must be a non-negative integer, otherwise it becomes `null`.
   - `recoveryStatusLabel` must be a non-empty string, otherwise it becomes `null`.
   - retry and notice flags are coerced to booleans.
   - `continueSurface` is normalized to `legacy` only when the legacy continue element is actually visible.
4. The classifier applies priority in this order:
   - recovering
   - error
   - stopped
   - completed
   - streaming
   - idle
5. During recovery, failure retry and failure notice output are forced to `false` because automatic recovery and final failure UI are mutually exclusive in the visible surface.
6. `getMainChatMessageListReactBridgeState()` attaches the output as `generationControl`.
7. `app/workspace-panels.tsx` validates the payload through `mainChatGenerationControlSchema`.
8. The hidden React controller writes the phase and retry marker attributes. It does not create, replace, click, or dispatch visible generation controls.

## Key Rules

- Recovery wins over final failure UI while `.generation_auto_recovery_status` exists.
- Final error state can expose `failureRetryVisible` and `failureNoticeVisible`.
- Recoverable-state `continueVisible` must match the observed `continueSurface`; hidden legacy continue cannot be reported as visible.
- Stopped and completed states are recoverable from the user's perspective: composer input can continue, and legacy continue may be available according to existing rules.
- Invalid bridge payloads fail closed to idle on the React side.
- `continueSurface` is observational. It does not redefine `#mes_continue` as provider stream resume.
- Slash-command pause/continue/abort controls under `#form_sheld` remain outside this bridge.

## Output Schema

```json
{
  "generationControl.phase": "validated enum",
  "generationControl.activeMessageId": "non-negative integer or null",
  "generationControl.failureRetryVisible": "boolean",
  "hiddenMarker.phase": "generationControl.phase or idle fallback",
  "hiddenMarker.retry": "visible when validated failureRetryVisible is true, otherwise hidden",
  "generationControl.continueVisible": "true only when continueSurface is legacy"
}
```

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/main_chat_generation_control_bridge_sandbox_proof.py
```

The proof script embeds fake legacy facts and validates streaming, structured fallback recovery, final failure, unsafe metadata normalization, continue-surface consistency, schema fallback, and hidden marker output.

## Boundaries And Failure Modes

- If the bridge payload is missing, malformed, or contains an unsupported phase, React uses the idle fallback and visible legacy controls continue to own the UI.
- If recovery status exists at the same time as a stale retry element, recovery output hides the retry and notice flags until the final failure state is reached.
- If `activeMessageId` cannot be resolved as a non-negative integer, the bridge reports `null` instead of inventing row identity.
- If workspace-panels bundle import or mount fails, `public/script.js` remains the visible generation-control owner and the user sees the legacy surface.
