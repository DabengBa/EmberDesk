---
description: "This document records the implementation-facing boundary for all main-chat generation lifecycle coordination."
kind: technical
topic: main-chat-generation-lifecycle
---

# Main Chat Generation Lifecycle

## Module Responsibility

This document records the implementation-facing boundary for all main-chat generation lifecycle coordination.

The lifecycle boundary covers:

- deciding whether a generation is eligible for bounded automatic recovery
- planning the primary, primary-retry, and optional fallback attempts
- preserving the current assistant-turn baseline for regenerate and bounded recovery
- deciding when partial attempt text should be cleared or restored
- keeping recovery status outside `.mes_text`

It does not replace provider-specific payload builders, the compatibility-visible row DOM, slash-command registration, or the separately scoped renderer/windowing migration.

## Architecture And Constraints

`public/scripts/generation-service.js` is the browser-facing generation service. It uses the installed typed lifecycle in `app/lib/generation/attempt-executor.ts`, while `public/scripts/chat-generation-command-service.js`, `public/scripts/chat-generation-lifecycle.js`, and `public/scripts/chat-generation-auto-recovery.js` provide command classification and bounded recovery decisions. There is no second React transport owner.

Important constraints:

- every visible and non-visible request is classified into an explicit generation command; unsupported command kinds reject instead of falling through to a second transport owner
- Eligible top-level visible OpenAI-compatible generation may enter bounded automatic recovery; an active normal reply-pipeline continuation also gets its own bounded recovery chain.
- `quiet`, ordinary nested `depth > 0` requests, dry-run, user abort, and non-OpenAI main API paths must not auto-retry. The active reply-pipeline continuation above is the nested-depth exception.
- fallback readiness must use the shared `hasFallbackProviderSettings()` helper
- automatic recovery remains bounded to the existing chain: original request, one primary retry, optional fallback retry, then the existing manual retry CTA
- recovery status rows must stay outside `.mes_text` so message text remains readable and extension-facing row selectors stay stable

## Core Implementation

### Prompt preview and request-scoped prompts

`previewNextGenerationRequest()` uses the same generation assembly path but stops before the model transport. `createPromptContext` in `app/lib/generation/attempt-executor.ts` creates a lazily captured prompt map for each preview. Generation passes that map to World Info scanning, story and macro expansion, chat injection, and OpenAI request assembly. Temporary depth, quiet, and World Info prompt writes use that map, rather than swapping the shared `extension_prompts` object. Visible, quiet, and background generation continue to use the shared map by default.

`GENERATION_STARTED` and `GENERATION_AFTER_COMMANDS` retain their existing arguments and expose `promptContext` in the options object. An asynchronous listener that needs to contribute a request-local scan prompt can call `options.promptContext.setWorldInfoScanPrompt(key, value, position, depth, scan, role, filter)`. The text-completion combine events and `GENERATE_AFTER_DATA` also receive a trailing `{ promptContext }` argument. Existing contextless `setExtensionPrompt` and direct shared-map writes remain global: the runtime cannot attribute an arbitrary write after an `await` to a particular event invocation. Global contributions made before the preview map is captured are included; later writes require a refresh or an explicit request context. World Info scan and `CHAT_COMPLETION_PROMPT_READY` listeners retain their existing event shapes and are not implicitly scoped.

The snapshot recursively copies plain objects and arrays, including cycles and aliases, without evaluating property getters during copying. Functions, accessors, and non-plain objects remain shared references; calling a function or accessor can still observe or mutate external state. The supported `setExtensionPrompt` path normally stores string/number/boolean fields plus an optional filter function; direct shared-map writes can supply other shapes and do not gain full isolation. A concurrent browser test covers the real World Info scan and OpenAI assembly alongside a background generation and an asynchronous filter; it does not prove isolation of arbitrary listener side effects. In particular, chat-memory's existing generation-start listener can schedule maintenance even for dry runs.

The current `getExtensionPrompt` implementation uses an async predicate with `Array.prototype.filter`; a filter returning false is not awaited by that array operation. This pre-existing behavior is not evidence that filter rejection works and is outside the prompt-map isolation change.

Listener audit for this path: the reply-pipeline and generation-type macro start listeners skip dry runs; chat memory's start listener does not. The React runtime provider observes generation start, and the prompt-panel bridge observes `CHAT_COMPLETION_PROMPT_READY`. The temporary response-length hook listens to `GENERATE_AFTER_DATA`. No in-repository prompt-writing listener was found for these generation or World Info events. `generateRawData()` emits its own non-preview events without a prompt context. The old `evaluateMacros` outlet helper reads the global map but has no in-repository callers; the active macro engine receives the request map. These observations are not a guarantee about arbitrary external listeners or their side effects.

`public/scripts/chat-generation-command-service.js` owns the command matrix and compatibility-envelope mapping; attempt execution is installed from the typed runtime. Pure lifecycle decisions in `public/scripts/chat-generation-lifecycle.js` include:

- `createGenerationLifecyclePlan()` creates the attempt list for a visible generation

- `getGenerationFailureDecision()` classifies intermediate versus final failure cleanup
- `getGenerationSuccessFinalization()` describes successful finalization state
- `hasFallbackProviderForGeneration()` delegates fallback readiness to `hasFallbackProviderSettings()`

`public/script.js` keeps compatibility entry points such as `Generate()` and delegates to the service-owned attempt loop. React composer and message actions dispatch visible commands directly; slash, quiet, background, dry-run and nested callers reach the same command/lifecycle boundary. The React composer calls `stopGeneration()` from its stop button. Regenerate preserves its assistant-turn baseline, while failed intermediate attempts clear the attempt row before retrying. Continue and swipe are retired from the current command surface.

### Composer input ownership

`ChatComposer` owns the controlled textarea, selection, IME events, focus restoration, sizing, and desktop Enter shortcut. The shell injects the existing `main-chat-composer-service.js` instance at mount; the React bundle does not instantiate another state owner. Other consumers use the same service for programmatic edits, autocomplete, macros, and per-chat drafts. The former native input bridge, capture handlers, delegated send/stop handlers, and document-level Enter sender are removed.

Submission captures text and draft identity synchronously, passes `composerSubmission` through the existing request envelope, and uses the existing visible-generation mutex. Awaited preparation never rereads a newer draft as the submitted message. Consuming the draft compares its context and revision; typing after submission remains in the input. Chat changes and aborts cancel stale work before user-message insertion, including attachment conversion/upload. Attachment cleanup resets only the file selection consumed by that operation. Slash execution advances its own expected draft identity after accepted writes, and permanently loses write eligibility after a conflicting edit or chat change. Autocomplete rejects results from obsolete text, selection, or context.

The shell continues to reuse the existing provider payload builders and stable row/event behavior. `GenerationStreamSession` is the internal streaming implementation for request execution; it keeps token append and final row completion compatible with the current renderer. React does not own a second transport executor, and visible/quiet owner markers or fallback handoffs no longer exist. Quiet/background requests use their non-visible contract: no assistant row, return generated text, and no automatic recovery.

For an active reply pipeline, `public/scripts/generation-service.js` plans recovery per continuation round, so a failed later round does not replay completed tool actions. The attempt model is resolved before request construction and stream selection: fallback-provider recovery takes precedence over the active step model, then the preset model. `public/scripts/reply-pipeline.js` retains the captured prefix and `public/scripts/openai.js` retains the step prompt tail for retries; the tail's macros use the initial attempt model even if a retry switches models. See [Reply Pipeline](../db/features/reply-pipeline.md) for the user-facing boundary.

## Scope Boundary

The unified service covers the current direct-chat, dry-run, nested, quiet, and background request families. The current transport supports OpenAI-compatible chat completion; retired group, swipe, continue and non-OpenAI transport paths are not implied by this boundary. Bounded recovery and public row/event contracts remain required.

## Validation

Focused proof:

```bash
pnpm --dir tests run test:unit -- generation-lifecycle-service.test.js main-chat-composer-submission.test.js world-info-scan-service.test.js reply-pipeline-assembly.test.js prompt-inspector.test.js --runInBand
(cd tests && node run-playwright-lane.mjs prompt-inspector.e2e.js --workers=1)
pnpm run test:compat
```

The inspector browser lane covers preview request assembly and a real World Info scan concurrent with a background request against a stub provider. The generation streaming and regenerate browser lanes provide additional recovery and cancellation coverage; none of these commands alone proves all asynchronous callers or live-provider behavior.

## Related Semantic IDs And Binding Points

Semantic IDs:

- `page.chat_workspace`
- `feature.chat_generation_auto_recovery`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`
- `feature.fallback_provider`
- `feature.reply_pipeline`

Stable binding points:

- `public/scripts/chat-generation-lifecycle.js`
- `public/scripts/chat-generation-auto-recovery.js`
- `public/scripts/chat-generation-command-service.js`
- `Generate()` in `public/script.js`
- `GenerationStreamSession` in `public/scripts/generation-service.js`
- `.generation_auto_recovery_status`
- `#chat > .mes`
- `.mes_text`
- `.mes[mesid]`

Related docs:

- [Main Chat Rendering Call Chain](main-chat-rendering-call-chain.md)

- [Chat Generation Auto Recovery](../db/features/chat-generation-auto-recovery.md)
