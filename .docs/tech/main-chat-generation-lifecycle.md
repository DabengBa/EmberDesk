# Main Chat Generation Lifecycle

## Module Responsibility

This document records the implementation-facing boundary for visible main-chat generation lifecycle coordination.

The lifecycle boundary covers:

- deciding whether a generation is eligible for bounded automatic recovery
- planning the primary, primary-retry, and optional fallback attempts
- preserving existing assistant-row baselines for `continue` and `swipe`
- deciding when partial attempt text should be cleared or restored
- keeping recovery status outside `.mes_text`

It does not own provider payload assembly, token append mechanics, quiet/background generation, slash-command generation, or provider routing.

## Architecture And Constraints

`public/scripts/chat-generation-lifecycle.js` is an internal seam used by `public/script.js` and the current React-owned visible transport slice. It builds on `public/scripts/chat-generation-auto-recovery.js` instead of replacing it.

Important constraints:

- only visible main-chat OpenAI-compatible generation may enter the lifecycle plan
- `quiet`, nested `depth > 0`, dry-run, user abort, and non-OpenAI main API paths must not auto-retry through this module
- fallback readiness must use the shared `hasFallbackProviderSettings()` helper
- automatic recovery remains bounded to the existing chain: original request, one primary retry, optional fallback retry, then the existing manual retry CTA
- recovery status rows must stay outside `.mes_text` so message text remains readable and extension-facing row selectors stay stable

## Core Implementation

`public/scripts/chat-generation-lifecycle.js` owns pure lifecycle decisions:

- `createGenerationLifecyclePlan()` creates the attempt list for a visible generation
- `getGenerationAttemptBaseline()` returns the restore baseline that should be used for the active message row
- `getGenerationFailureDecision()` classifies intermediate versus final failure cleanup
- `getGenerationSuccessFinalization()` describes successful finalization state
- `hasFallbackProviderForGeneration()` delegates fallback readiness to `hasFallbackProviderSettings()`

`public/script.js` keeps the compatibility entry points in `Generate()`, `swipe()`, and `prepareVisibleGeneration()`. Before a visible generation starts, it captures an existing-message baseline with `createExistingMessageRecoveryBaseline(type)` for `continue` and `swipe`. Supported React-owned visible direct-chat requests reuse the same lifecycle attempt planning through `prepareVisibleGeneration()`: `submitComposer`, `continueLast`, `retryGeneration`, `swipeLeft`, and `swipeRight`. `retryGeneration` is the bridge kind used by both the top-level regenerate button and the failed-row retry entry. Excluded compatibility requests still enter through the legacy `Generate()` / `swipe()` path. Failed intermediate attempts call `clearGenerationAttemptMessage(messageId, baseline)` so partial failed text does not leak into the next attempt, while final failure restores the original assistant row when the generation started from an existing row.

The lifecycle module decides recovery and cleanup around streaming, but it does not own provider routing decisions beyond the bounded retry plan and it does not replace the compatibility request builders. For supported React-owned visible transport, token append and final row completion now happen in the React mutation while still reusing the same bounded lifecycle plan. For excluded compatibility paths, `StreamingProcessor` remains the token append owner.

## Validation

Focused proof:

```bash
bun run --cwd tests test:unit -- chat-generation-lifecycle.test.js chat-generation-auto-recovery.test.js chat-workspace-structure.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js
bun run test:compat
```

The E2E proof covers primary failure fallback, stop exclusion from auto recovery, final manual recovery, continue baseline preservation, swipe baseline preservation, pre-token failure recovery, supported React-owned send/continue/regenerate/retry/swipe transport, excluded-path legacy fallback, and mobile reachability.

## Related Semantic IDs And Binding Points

Semantic IDs:

- `page.chat_workspace`
- `feature.chat_generation_auto_recovery`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`
- `feature.fallback_provider`

Stable binding points:

- `public/scripts/chat-generation-lifecycle.js`
- `public/scripts/chat-generation-auto-recovery.js`
- `Generate()` in `public/script.js`
- `StreamingProcessor` in `public/script.js`
- `.generation_auto_recovery_status`
- `#chat > .mes`
- `.mes_text`
- `.mes[mesid]`

Related docs:

- [Main Chat Successor Scope](main-chat-successor-scope.md)
- [Main Chat Rendering Call Chain](main-chat-rendering-call-chain.md)
- [Third-Party Extension Compatibility](third-party-extension-compatibility.md)
- [Chat Generation Auto Recovery](../db/features/chat-generation-auto-recovery.md)
