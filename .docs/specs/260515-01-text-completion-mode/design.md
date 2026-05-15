---
feature: Remove Text Completion API Mode (textgenerationwebui)
status: draft
created: 2026-05-15
---

# Remove Text Completion API Mode

## Goal

Completely remove the `textgenerationwebui` API mode and all related infrastructure. EmberDesk will have a single API mode: Chat Completion (OpenAI/Claude/Google AI Studio).

## Problem

The `textgenerationwebui` mode was designed for direct connections to local LLM servers (Ollama, vLLM, KoboldCPP, llama.cpp, etc.) with per-provider request formatting. After the provider cleanup, these servers are accessed through the OpenAI provider with Custom Base URL, making the entire textgen mode dead infrastructure.

The textgen mode touches **20+ files** with deeply integrated conditional logic (`main_api === 'textgenerationwebui'`). Leaving it creates confusion, maintenance burden, and unused UI surface.

## Scope

### In scope
- Remove `#main_api` selector (only one mode remains)
- Remove entire `#textgenerationwebui_api` UI panel and preset system
- Delete backend files: `text-completions.js`, `additional-headers.js`, `kobold.js`
- Delete frontend file: `textgen-settings.js`
- Remove `TEXTGEN_TYPES`, all `*_KEYS` arrays from `constants.js`
- Clean all conditional `main_api === 'textgenerationwebui'` branches across 10+ JS files
- Remove textgen preset storage/loading
- Remove textgen tokenizer route
- Clean vector extension references to textgen server URLs

### Out of scope
- Changes to OpenAI, Claude, Google AI Studio provider logic
- Changes to shared features (samplers, prompts, macros) beyond removing dead branches

## Changes

### Files to DELETE

| File | Reason |
|---|---|
| `src/endpoints/backends/text-completions.js` | Entire file handles textgen `/status` and `/generate` |
| `src/endpoints/backends/kobold.js` | KoboldCPP-specific endpoint logic |
| `src/additional-headers.js` | Header getters for all textgen API types |
| `public/scripts/textgen-settings.js` | Frontend textgen settings, types, UI logic |

### Files to MODIFY

#### `src/constants.js`
Remove:
- `TEXTGEN_TYPES` object (lines 199-215)
- `INFERMATICAI_KEYS` (lines 217-238)
- `FEATHERLESS_KEYS` (lines 240-280)
- `TOGETHERAI_KEYS` (lines 283-296)
- `OLLAMA_KEYS` (lines 299-315)
- `OPENAI_KEYS` (lines 318-333)
- `OPENROUTER_KEYS` (lines 354-372)
- `VLLM_KEYS` (lines 375-415)

Keep: `CHAT_COMPLETION_SOURCES`, `GEMINI_SAFETY`, `OPENAI_REASONING_EFFORT_*`, `MEDIA_*`, etc.

#### `public/index.html`
- Remove `#main_api` select and `#main-API-selector-block` (lines 1597-1603). The Chat Completion section is always visible.
- Remove entire `#textgenerationwebui_api` div (lines 1604-2082): API Type selector, all sub-provider forms, connection button, status indicator
- Remove `#textgenerationwebui_api-presets` section (lines 213-257): preset manager for textgen
- Remove `#textgenerationwebui_api-settings` deferred panel (line 1200)
- Remove `#textgenerationwebui_api-settings` data-deferred-panel reference
- Rename "Chat Completion Presets" label to "Presets" (line 173)

#### `public/script.js`
- Remove imports from `textgen-settings.js` (lines 29-38)
- Remove `main_api` initialization/usage that depends on textgen mode
- Hardcode `main_api = 'openai'` or remove the variable entirely

#### `public/scripts/openai.js`
- Remove `TEXT_COMPLETION_MODELS` import
- Remove `convertTextCompletionPrompt` import
- Remove `main_api` guards that skip logic when not 'openai'

#### `public/scripts/samplerSelect.js`
- Remove all `main_api === 'textgenerationwebui'` branches (lines 44, 52, 68, 202, 221, 233-234, 260, 282-283, 299)

#### `public/scripts/slash-commands.js`
- Remove `textgen_types` and `textgenerationwebui_settings` imports
- Remove textgen-related slash command registrations (model selection, API type, server URLs)
- Remove `main_api !== 'textgenerationwebui'` guards

#### `public/scripts/reasoning.js`
- Remove `textgen_types` import and OPENROUTER/OLLAMA cases (lines 17, 102, 104)

#### `public/scripts/RossAscends-mods.js`
- Remove `textgen_types` import and textgen connection logic (lines 39, 374-379)

#### `public/scripts/secrets.js`
- Remove `textgen_types` import and textgen key mapping (lines 14, 212)

#### `public/scripts/tokenizers.js`
- Remove `main_api === 'textgenerationwebui'` branches (lines 602, 1221)

#### `public/scripts/macros.js` and `macros/definitions/core-macros.js`
- Remove `main_api === 'textgenerationwebui'` branches (lines 445, 441)

#### `src/endpoints/presets.js`
- Remove `textgenerationwebui` case (line 24)

#### `src/endpoints/settings.js`
- Remove `textgenerationwebui_presets` references (lines 181, 215-216)

#### `src/endpoints/tokenizers.js`
- Remove `TEXTGEN_TYPES` import
- Remove `/remote/textgenerationwebui/encode` route (line 1074)
- Remove textgen tokenizer switch cases (lines 1094-1110)

#### `src/vectors/vllm-vectors.js`, `ollama-vectors.js`, `llamacpp-vectors.js`
- Remove `TEXTGEN_TYPES` imports and related logic. These files may become empty; if so, delete them.

#### Extension files
- `public/scripts/extensions/shared.js` — Remove `textgen_types` import and server URL logic
- `public/scripts/extensions/caption/index.js` — Remove `textgen_types` import and mapping
- `public/scripts/extensions/vectors/index.js` — Remove `textgen_types` import and server URL logic

## Key Decision: `main_api` Variable

Currently `main_api` can be `'textgenerationwebui'` or `'openai'`. After removal, it's always `'openai'`.

**Approach:** Keep the variable but hardcode it. Remove the `#main_api` select from HTML. Set `main_api = 'openai'` in the JS initialization. This avoids a massive find-and-replace across every `main_api` reference while making the intent clear.

## Evidence

- `src/constants.js:199-415` - TEXTGEN_TYPES and all *_KEYS arrays
- `src/endpoints/backends/text-completions.js` - entire file (textgen backend)
- `src/endpoints/backends/kobold.js` - entire file (KoboldCPP backend)
- `src/additional-headers.js` - entire file (textgen headers)
- `public/scripts/textgen-settings.js` - entire file (frontend textgen settings)
- `public/index.html:1597-2082` - main_api selector + textgen UI panel
- `public/index.html:213-257` - textgen preset manager

## Verification

1. `node -c` syntax check on all modified files
2. App starts without errors
3. Connect to OpenAI API: works as before
4. Connect to Claude API: works as before
5. Connect to Google AI Studio: works as before
6. Connect to custom endpoint (OpenAI + Custom URL): works as before
7. Grep for `textgenerationwebui`, `TEXTGEN_TYPES`, `textgen_types`, `main_api.*textgen`: zero results
8. Preset save/load works for Chat Completion
