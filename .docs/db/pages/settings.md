---
id: page.settings
type: page
name: Settings
route: /settings
related: [page.api_configuration, page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider]
---

# Page: Settings

## ID 解释

`page.settings` represents the sole React owner for authenticated provider/API, UI, formatting, and power-user settings at `/settings`. It covers the two tabs, secret workflows, provider Connect/Test actions and status, revision-aware save, and diagnostics. Generation defaults (sampling, continue, prompt formats) are owned by the AI Response Configuration drawer instead. It does not host World Info or Backgrounds workflows; the legacy Persona Management surface, the API Connections drawer (`rm_api_block`), and the Advanced Formatting drawer (`AdvancedFormatting`) are retired.

## Page Purpose

Authenticated users complete supported settings work on `/settings` instead of workspace Settings / AI Config / Advanced Formatting drawers. Workspace shell entries open the same React Settings surface as an in-workspace overlay; `/settings` remains the deep-link and full-page mount. Missing React build returns a clear rebuild error rather than a legacy drawer fallback.

## Page Structure (UI Layout)

1. **Header**: Settings title, short summary, and a return link to [Chat Workspace](page.chat_workspace).
2. **Tabs**: 服务 (Providers), 高级 (Advanced). The interface tab is retired: density, colors, chat display, and message-visibility preferences are fixed to shipped defaults at runtime.
3. **Providers tab**: the provider contract — base URL, API key, primary model, and fallback model — on the single OpenAI-compatible source, plus the Connect/Test actions and the live connection-status pill routed through the runtime command port. The fallback model reuses the same URL and key; there is no fallback credential, reverse-proxy field, or connection-profile picker on this surface. Prompt post-processing is not a field: the server always applies strict normalization before forwarding chat-completion requests.
4. **Retired interface preferences**: chat width (50vw), font scale (1), chat display (default style), timestamps (on), compact input (on), message token count (off), media display (list), send-on-enter (automatic), generated-markdown auto-fix (off), external media (forbidden by default with per-entity overrides), fast UI mode / no shadows (on), and reduced motion (OS preference) are fixed constants, not fields. Stored `power_user.custom_css` still applies once at load and round-trips invisibly so existing user styling survives; the remaining interface keys are stripped from saved payloads.
5. **Advanced tab**: tokenizer, custom stopping strings, smooth streaming, and STscript autocomplete controls. The global system prompt (`power_user.sysprompt`) is retired — system-instruction authoring lives in the AI Response Configuration drawer's Prompt Manager and per-character card `system_prompt`; reasoning parsing is fixed-on with `<think>`/`</think>` markers (`power_user.reasoning` is retired; stored objects are stripped on load and save). Named preset management (preset selector/action rows, master `{sysprompt, reasoning, srw}` import/export, the `formattingPreset` runtime command, file-backed `sysprompt`/`reasoning` preset CRUD, and the `/sysprompt`, `/sysprompt-on`, `/sysprompt-off`, `/sysprompt-state`, `/reasoning-template`, `/reasoning-formatting`, `/reasoning-preset` selection commands) is retired; per-user preset directories remain inert historical data. Retired instruct-mode and context-template fields are absent; stored `power_user.instruct`/`power_user.context` keys remain inert historical data. Retired `power_user` keys (auto-swipe/auto-continue, streaming FPS/fade/speed knobs, text post-processing, theme color/blur/shadow pickers, quick-action buttons, display micro-toggles, and similar legacy settings) are stripped from saved payloads so stale keys do not round-trip.
6. **Diagnostics sidebar**: optional ownership ledger and payload summary for debugging.
7. **Save bar**: submits a compatibility payload derived from the loaded document while rewriting only the React-bound fields the user changed; save stays disabled until the form is dirty.
8. **Workspace panels section (overlay only)**: the in-workspace overlay ends the Providers tab with a link that closes the overlay and opens the legacy AI Response Configuration drawer (preset actions, sampling sliders, Prompt Manager), and the Advanced tab with a link to the User Settings drawer (account, language, debug menu, clean-up, and remaining power-user extras). The retired API Connections and Advanced Formatting drawers no longer appear here.

## Page-Level Semantic IDs

- `feature.chat_completion_select`: provider and model selection in Providers.
- `feature.custom_base_url`: the single base URL and unified key in Providers.
- `feature.fallback_provider`: the model-only fallback field in Providers.
- `page.api_configuration`: retired workspace drawer; generation defaults (presets, sampling, reasoning, continue, prompt formats) live in the separate AI Response Configuration drawer that this page no longer duplicates.
- `page.chat_workspace`: workspace shell mounts this shared surface's overlay variant through a single Chinese `设置` entry.

## Included Features

!include feature.chat_completion_select
!include feature.custom_base_url
!include feature.fallback_provider

## Page States And Constraints

- **Sole-owner route state**: authenticated `/settings` always serves the React settings shell when the React app build exists.
- **Missing-build state**: absent `app/dist` returns HTTP 503 with rebuild instructions; there is no redirect into workspace legacy settings drawers.
- **Workspace navigation state**: the shell's single `设置` entry opens the React Settings surface as an in-workspace overlay on the last-used tab without leaving `/`. The `openAIConfig`/`openFormatting` compatibility commands remain dispatchable (landing on 服务/高级 respectively) for deep links and external callers. Direct `/settings` and `/settings?tab=...` remain full-page mounts for deep links, refresh, and share; retired `?tab=general` links fall back to the first tab.
- **Generation defaults state**: preset selection, context/token limits, sampling, reasoning, continue, prompt-format, and names-behavior values (`oai_settings.*` generation keys) are edited only in the AI Response Configuration drawer. React Settings loads and saves them untouched as part of the document.
- **Auth state**: unauthenticated users are redirected to login.
- **Dirty / busy / error states**: save is disabled until dirty; save/secret actions expose busy and error feedback without fake success.
- **Save state**: save posts a document-compatible payload and rewrites only changed bound fields; unknown document fields round-trip without materializing unrelated defaults.
- **Conflict state**: stale `settings_revision` yields HTTP 409; the page keeps the local draft visible, disables further save, and provides an explicit reload action. Reload intentionally discards that draft so the user can merge against current settings before saving again.
- **Secret state**: the single provider value uses SecretManager endpoints only and never enters settings JSON; there is no dedicated fallback secret.
- **Retired provider state**: legacy `vertexai`/`makersuite`/`palm`/`claude` sources load as OpenAI and save back as `openai`; retired provider model keys remain stored but inert.
- **Retired template state**: instruct-mode and context-template presets are retired; `/api/settings/get` no longer returns `instruct`/`context` preset lists and `/api/presets/*` no longer accepts `instruct`/`context` API IDs. Stored `power_user.instruct`/`power_user.context` keys and per-user preset directories are preserved as inert historical data.
- **Retired formatting preset state**: named system-prompt/reasoning presets are retired; `/api/settings/get` no longer returns `sysprompt`/`reasoning` preset lists, `/api/presets/*` no longer accepts `sysprompt`/`reasoning` API IDs, and the default preset seeds are gone. The active `power_user.sysprompt`/`power_user.reasoning` objects are also retired: the global system prompt was superseded by Prompt Manager/card prompts, and reasoning parsing always applies fixed `<think>`/`</think>` markers without prompt re-injection, auto-expand, or hidden-message display. Stored objects are stripped on load and save; per-user `sysprompt/`/`reasoning/` directories are preserved as inert historical data.
- **Retired sampler state**: logit-bias presets and token-probability (logprobs) requests are retired; `oai_settings.bias_presets`/`bias_preset_selected` and `power_user.request_token_probabilities` remain stored but inert, and `/api/backends/chat-completions/bias` is removed.
- **Specialized surfaces**: World Info, tags, and complex managers remain outside this page even if related values appear in the settings document. Feature-specific values live under the `feature_settings` document bag.

## Navigation

- Primary daily entry: workspace shell overlay on [Chat Workspace](page.chat_workspace).
- Deep-link / full-page entry: `/settings` for authenticated users.
- Workspace chrome: the single `设置` entry opens the overlay on the last-used tab (session memory); the `openAIConfig`/`openFormatting` commands still land on 服务/高级 as compatibility aliases.
- Full-page return: header link back to [Chat Workspace](page.chat_workspace); overlay uses a close control instead.

## Canonical Settings Document Authority

Canonical SQLite storage is enabled by default for all slices. With the `settings` audit scope
clean, the full settings JSON document is authoritative in per-user
`storage/emberdesk.sqlite` (`settings_documents`) with a monotonic `revision`. Operators may keep
the existing global storage flags or explicitly override this settings slice; absent settings-slice
values retain the global behavior.

- **Get**: `/api/settings/get` may include `settings_revision` when serving from canonical SQLite. The `settings` field remains a JSON string. `world_names` is sourced from canonical `world_books` rows (directory files are import input only); other directory-derived payload fields (generation presets, quick replies, etc.) stay file/directory aggregates and are not part of the settings document.
- **Save**: `/api/settings/save` accepts protocol field `settings_revision` only (document fields named `revision` are ignored). Stale revisions return HTTP 409 with the current `settings_revision` (no full document body). React Settings sends the last-loaded revision, preserves the local draft on conflict, and requires an explicit reload before another save. Clients that still omit revision use the server current revision (compat LWW) until they adopt the field.
- **Projection**: After a successful DB commit, the server projects `settings.json`. Projection failure keeps the DB revision, records `settings_projection_repairs`, and returns 500 with a repair key.
- **Snapshots**: `/api/settings/make-snapshot` stores a canonical snapshot from the current revision and may also keep a file backup. Restore creates a **new** revision; the revision counter never rewinds. Open projection repairs block write rollback.
- **Flags off**: Existing atomic `settings.json` read/write continue to work; file writes invalidate the settings audit until re-audited.
- **Not in this authority**: secrets, and later feature/media normalizations that still live nested in the document for compatibility.
