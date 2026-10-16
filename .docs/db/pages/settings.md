---
id: page.settings
type: page
name: Settings
route: /settings
related: [page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider]
---

# Page: Settings

## ID 解释

`page.settings` represents the sole React owner for authenticated provider/API settings at `/settings`. It covers the Providers tab, secret workflows, provider Connect/Test actions and status, revision-aware save, and diagnostics. Generation defaults (sampling, continue, prompt formats) persist in `oai_settings` but have no editing surface. It does not host World Info or other specialized workflows.

## Page Purpose

Authenticated users complete supported settings work on `/settings`. The workspace shell `设置` entry opens the same React Settings surface as a top-center drawer (`#SettingsPanel`, same chrome as World Info/Regex); `/settings` remains the deep-link and full-page mount. Missing React build returns a clear rebuild error rather than a legacy drawer fallback.

## Page Structure (UI Layout)

1. **Header**: Settings title and a return link to [Chat Workspace](page.chat_workspace); field and section explanatory text is intentionally omitted — labels are self-descriptive, with inline notes only where blank-value semantics are non-obvious.
2. **Tabs**: a single 服务 (Providers) page — the tab strip hides when only one tab exists. Interface and advanced preferences are fixed to shipped defaults at runtime rather than editable tabs.
3. **Providers tab**: the provider contract — base URL, API key, primary model, and fallback model — on the single OpenAI-compatible source, plus the Connect/Test actions and the live connection-status pill routed through the runtime command port. On the standalone page (no workspace runtime) Connect/Test call `/api/backends/chat-completions/status` and `/api/backends/chat-completions/generate` directly with the current form values, and the pill tracks the last page-side result instead of the workspace provider state. The fallback model reuses the same URL and key; there is no fallback credential, reverse-proxy field, or connection-profile picker on this surface. Prompt post-processing is not a field: the server always applies strict normalization before forwarding chat-completion requests.
4. **Fixed interface preferences**: chat width (50vw), font scale (1), chat display (default style), timestamps (on), compact input (on), message token count (off), media display (list), send-on-enter (automatic), generated-markdown auto-fix (off), external media (forbidden by default with per-entity overrides), fast UI mode / no shadows (on), and reduced motion (OS preference) are fixed constants, not fields. Stored `power_user.custom_css` no longer applies and is stripped on load and save; the remaining interface keys are stripped from saved payloads.
5. **Fixed generation/runtime defaults**: tokenizer is always best-match, token padding is fixed at 64 (`TOKEN_PADDING`), message/prompt trimming is always on, `{{char}}` name forcing is always on (still disabled during impersonation), smooth streaming is off, STscript matching is fixed `fuzzy`, and autocomplete always shows. Stopping strings are only ephemeral `/gen stop=...` or per-message `/send`-style bias. System-instruction authoring lives in per-character card `system_prompt`; reasoning parsing is fixed-on with `<think>`/`</think>` markers. Prompt assembly uses the frozen shipped defaults (`DEFAULT_CONTEXT` keeps the seeded story string with `{{wiBefore}}`/`{{wiAfter}}` injection markers, `chat_start`/`example_separator` `'***'`, and `INERT_INSTRUCT` resolves instruct macros to empty). Stored legacy `power_user` keys (`sysprompt`, `reasoning`, `instruct`, `context`, interface and advanced knobs) are stripped on load and save; per-user preset directories remain inert on-disk data.

6. **Diagnostics sidebar**: collapsed by default behind the header `诊断` toggle; when expanded it shows the optional ownership ledger and payload summary for debugging.
7. **Save bar**: submits a compatibility payload derived from the loaded document while rewriting only the React-bound fields the user changed; save stays disabled until the form is dirty.
8. **消息渲染设置 section**: the Providers page ends with the merged Frontend Frames fields (enable, render depth, ignore-hidden, collapse code block, skip highlight, blob-URL debug, render-while-streaming) bound to `power_user.frontend_frames.*` — the former `user-settings-block` drawer is retired, and the fields save through the same dirty-aware form bar. Swipe arrows are always on, and the initial long-chat window is fixed at `CHAT_TRUNCATION` = 100 with load-more paginating the same step.

## Page-Level Semantic IDs

- `feature.chat_completion_select`: provider and model selection in Providers.
- `feature.custom_base_url`: the single base URL and unified key in Providers.
- `feature.fallback_provider`: the model-only fallback field in Providers.
- `page.chat_workspace`: workspace shell mounts this shared surface's drawer variant through a single Chinese `设置` entry.

## Included Features

!include feature.chat_completion_select
!include feature.custom_base_url
!include feature.fallback_provider

## Page States And Constraints

- **Sole-owner route state**: authenticated `/settings` always serves the React settings shell when the React app build exists.
- **Missing-build state**: absent `app/dist` returns HTTP 503 with rebuild instructions; there is no redirect into workspace legacy settings drawers.
- **Workspace navigation state**: the shell's single `设置` entry opens the React Settings surface as a top-center drawer (`#SettingsPanel`) on the last-used tab without leaving `/`; it shares drawer mutual exclusion, Escape, and dirty-close guarding with the other central drawers. Direct `/settings` and `/settings?tab=...` remain full-page mounts for deep links, refresh, and share; unknown `?tab=` values fall back to the first tab.
- **Generation defaults state**: preset selection, context/token limits, sampling, reasoning, continue, prompt-format, and names-behavior values (`oai_settings.*` generation keys) have no editing surface; stored values continue to drive generation unchanged, and React Settings loads and saves them untouched as part of the document.
- **Auth state**: unauthenticated users are redirected to login.
- **Dirty / busy / error states**: save is disabled until dirty; save/secret actions expose busy and error feedback without fake success.
- **Save state**: save posts a document-compatible payload and rewrites only changed bound fields; unknown document fields round-trip without materializing unrelated defaults.
- **Conflict state**: stale `settings_revision` yields HTTP 409; the page keeps the local draft visible, disables further save, and provides an explicit reload action. Reload intentionally discards that draft so the user can merge against current settings before saving again.
- **Secret state**: the single provider value uses SecretManager endpoints only and never enters settings JSON; there is no dedicated fallback secret.
- **Legacy provider normalization state**: legacy `vertexai`/`makersuite`/`palm`/`claude` sources load as OpenAI and save back as `openai`; legacy provider model keys remain stored but inert.
- **Legacy preset state**: `/api/settings/get` returns only OpenAI presets (`openai_settings`/`openai_setting_names`) plus `world_names`; `instruct`/`context`/`sysprompt`/`reasoning` preset lists and legacy provider preset lists (`koboldai`, `novelai`, `textgenerationwebui`, `quickReplyPresets`) are not returned, and `/api/presets/*` accepts only the `openai` API ID. Stored `power_user.instruct`/`power_user.context`/`power_user.sysprompt`/`power_user.reasoning` keys are stripped on load and save; per-user preset directories are preserved as inert on-disk data.
- **Legacy sampler state**: `oai_settings.bias_presets`/`bias_preset_selected` and `power_user.request_token_probabilities` remain stored but inert.
- **Specialized surfaces**: World Info, tags, and complex managers remain outside this page even if related values appear in the settings document. Feature-specific values live under the `feature_settings` document bag.

## Navigation

- Primary daily entry: workspace shell `设置` entry → `#SettingsPanel` top-center drawer on [Chat Workspace](page.chat_workspace).
- Deep-link / full-page entry: `/settings` for authenticated users.
- Workspace chrome: the single `设置` entry opens the drawer on the last-used tab (session memory).
- Full-page return: header link back to [Chat Workspace](page.chat_workspace); the drawer uses its chrome close control instead.

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
