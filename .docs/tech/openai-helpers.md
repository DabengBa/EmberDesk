# OpenAI Provider Helper Boundary

## Module Responsibility

`public/scripts/openai-provider-capabilities.js` owns the first pure helper boundary for OpenAI-style chat-completion provider decisions. It accepts explicit settings-like inputs and returns derived values for model selection, reasoning effort, verbosity, media capability descriptors, and effective media inlining support.

`public/scripts/openai.js` remains the compatibility layer. It owns global reads, DOM bindings, request assembly, feature flag updates, logs, UI side effects, and existing exported wrapper names.

## Architecture And Constraints

- The helper must not read DOM, `oai_settings`, `main_api`, `ToolManager`, `eventSource`, or browser globals.
- `getChatCompletionModelFromSettings(settings)` returns the selected model string from an already-merged effective settings object.
- `resolveChatCompletionModel(settings, { mainApi })` returns a descriptor for the current provider/model.
- `isImageInliningSupportedForSettings()`, `isVideoInliningSupportedForSettings()`, and `isAudioInliningSupportedForSettings()` return effective runtime support for inlining. They include capability checks plus gates such as `mainApi === 'openai'` and `settings.media_inlining`.
- The helper-local `CHAT_COMPLETION_SOURCES` constant is temporary. As of 2026-06-04 the same source values also exist in `public/scripts/openai.js`, `src/constants.js`, and focused tests. Future provider additions should consolidate the browser-side authority, with `public/scripts/constants.js` as the planned direction, before adding another provider.

## Core Implementation

Descriptor capability fields are model/source capability signals:

- `capabilities.vision`
- `capabilities.video`
- `capabilities.audio`
- `capabilities.reasoning`

These fields are not the same contract as the inlining predicates. A disabled `settings.media_inlining` value must not make `resolveChatCompletionModel().capabilities.vision` false when the model/source still supports vision. The descriptor is intended to stay usable for future model capability badges.

Effective inlining predicates answer a different question:

- Is the current main API chat completions?
- Is media inlining enabled in settings?
- Does the selected provider/model support that media type?

This split prevents future UI from confusing model capability badges with the current "Inline Media" toggle state.

OpenAI image support has an explicit local exclusion list for models that match broad supported prefixes but should not be treated as image-capable:

- `gpt-4-turbo-preview`
- `o1-mini`
- `o3-mini`

`tests/openai-provider-capabilities.test.js` covers this exclusion list directly.

## Naming Boundaries

`*FromSettings` and `*ForSettings` are local naming conventions for the OpenAI helper slice as of 2026-06-04:

- `*FromSettings` extracts a value from an effective settings object.
- `*ForSettings` evaluates a predicate from an effective settings object plus explicit options.

Do not automatically reuse these suffixes for later character-list or unrelated helper extraction. Reuse them only if the next helper boundary has the same "effective settings in, derived value out" shape.

## Related Semantic IDs And Code Bindings

- `page.api_configuration`: `.docs/db/pages/api-configuration.md`
- `feature.chat_completion_select`: `.docs/db/features/chat-completion-select.md`
- Code: `public/scripts/openai-provider-capabilities.js`
- Wrapper code: `public/scripts/openai.js`
- Tests: `tests/openai-provider-capabilities.test.js`

This tech doc does not redefine user-facing API Configuration behavior. Product semantics remain owned by `.docs/db/`.
