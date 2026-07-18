# Main Chat Generation Lifecycle

## Module Responsibility

This document records the implementation-facing boundary for all main-chat generation lifecycle coordination.

The lifecycle boundary covers:

- deciding whether a generation is eligible for bounded automatic recovery
- planning the primary, primary-retry, and optional fallback attempts
- preserving existing assistant-row baselines for `continue` and `swipe`
- deciding when partial attempt text should be cleared or restored
- keeping recovery status outside `.mes_text`

It does not replace provider-specific payload builders, the compatibility-visible row DOM, slash-command registration, or the separately scoped renderer/windowing migration.

## Architecture And Constraints

`public/scripts/chat-generation-command-service.js` is the framework-neutral command and attempt-execution owner. It uses `public/scripts/chat-generation-lifecycle.js` and `public/scripts/chat-generation-auto-recovery.js` for bounded recovery decisions instead of duplicating them in React or public adapters.

Important constraints:

- every visible and non-visible request is classified into an explicit generation command; unsupported command kinds reject instead of falling through to a second transport owner
- only eligible top-level visible OpenAI-compatible generation may enter bounded automatic recovery
- `quiet`, nested `depth > 0`, dry-run, user abort, and non-OpenAI main API paths must not auto-retry
- fallback readiness must use the shared `hasFallbackProviderSettings()` helper
- automatic recovery remains bounded to the existing chain: original request, one primary retry, optional fallback retry, then the existing manual retry CTA
- recovery status rows must stay outside `.mes_text` so message text remains readable and extension-facing row selectors stay stable

## Core Implementation

`public/scripts/chat-generation-command-service.js` owns the command matrix, compatibility-envelope mapping, attempt sequence execution, and result policies. It uses pure lifecycle decisions from `public/scripts/chat-generation-lifecycle.js`:

- `createGenerationLifecyclePlan()` creates the attempt list for a visible generation
- `getGenerationAttemptBaseline()` returns the restore baseline that should be used for the active message row
- `getGenerationFailureDecision()` classifies intermediate versus final failure cleanup
- `getGenerationSuccessFinalization()` describes successful finalization state
- `hasFallbackProviderForGeneration()` delegates fallback readiness to `hasFallbackProviderSettings()`

`public/script.js` keeps compatibility entry points such as `Generate()` and `swipe()`, but `Generate()` first creates a generation request envelope and delegates to the service-owned attempt loop. React composer and message actions dispatch visible commands directly; slash, group, quiet, background, dry-run, nested, and provider-specific callers keep their public APIs while reaching the same command/lifecycle boundary. The React composer also capture-owns the visible stop control, then dispatches the existing `stopGeneration()` lifecycle through its bridge after the pointer event settles; it does not implement a second abort path. Before a visible generation starts, the shell captures an existing-message baseline with `createExistingMessageRecoveryBaseline(type)` for `continue` and `swipe`. Failed intermediate attempts call `clearGenerationAttemptMessage(messageId, baseline)` so partial failed text does not leak into the next attempt, while final failure restores the original assistant row when the generation started from an existing row.

The shell continues to reuse the existing provider payload builders and stable row/event behavior. `GenerationStreamSession` is the internal streaming implementation for request execution; it keeps token append and final row completion compatible with the current renderer. React does not own a second transport executor, and visible/quiet owner markers or fallback handoffs no longer exist. Quiet/background requests use their non-visible contract: no assistant row, return generated text, and no automatic recovery.

## Scope Boundary

The unified service includes direct, group, provider-specific, dry-run, nested, quiet, and background request families without removing any public caller contract. Renderer ownership, editing, rich-body rendering, and long-chat windowing remain the next independent migration slice. The bounded recovery behavior and public row/event contracts remain required; a prior release, not an in-process transport fallback, is the rollback boundary.

## Validation

Focused proof:

```bash
bun run --cwd tests test:unit -- chat-generation-command-service.test.js chat-generation-lifecycle.test.js chat-generation-auto-recovery.test.js chat-completions-openai-fallback.test.js chat-completions-google.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js third-party-extension-runtime.e2e.js --workers=1
bun run test:compat
```

The E2E proof covers primary failure fallback, stop exclusion from auto recovery, final manual recovery, continue baseline preservation, swipe baseline preservation, pre-token failure recovery, direct command dispatch from the React composer/actions, renderer compatibility during streaming, and mobile reachability.

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
- `public/scripts/chat-generation-command-service.js`
- `Generate()` in `public/script.js`
- `GenerationStreamSession` in `public/script.js`
- `.generation_auto_recovery_status`
- `#chat > .mes`
- `.mes_text`
- `.mes[mesid]`

Related docs:

- [Main Chat Successor Scope](main-chat-successor-scope.md)
- [Main Chat Rendering Call Chain](main-chat-rendering-call-chain.md)
- [Third-Party Extension Compatibility](third-party-extension-compatibility.md)
- [Chat Generation Auto Recovery](../db/features/chat-generation-auto-recovery.md)
