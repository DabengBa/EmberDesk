---
id: page.settings
type: page
name: Settings
route: /settings
related: [page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider, feature.wire_log]
---

# Page: Settings

## ID 解释

`page.settings` represents the sole React owner for authenticated provider/API settings at `/settings`. It covers the Providers tab, secret workflows, provider Connect/Test actions and status, conversation memory, message rendering, revision-aware save, and diagnostics. Generation defaults (sampling, context limits, streaming, reasoning effort, prompt order) persist in `oai_settings` and are edited from the workspace prompt drawer instead. It does not host World Info or other specialized workflows.

## Page Purpose

Authenticated users complete supported settings work on `/settings`. The workspace shell `设置` entry opens the same React Settings surface as a top-center drawer (`#SettingsPanel`, same chrome as World Info/Regex); `/settings` remains the deep-link and full-page mount. Missing React build returns a clear rebuild error rather than a legacy drawer fallback.

## Page Structure (UI Layout)

1. **Header**: Settings title plus the `诊断` toggle and a return link to [Chat Workspace](page.chat_workspace). The drawer variant omits this header and moves `诊断` into the save bar. Field and section explanatory text is intentionally omitted — labels are self-descriptive — with narrow exceptions: a short script-execution warning on the Frontend Frames toggle and a one-line explanation on the conversation-memory toggle.
2. **Tabs**: a single 服务 (Providers) page — the tab strip hides when only one tab exists. Interface and advanced preferences are fixed to shipped defaults at runtime rather than editable tabs.
3. **Providers tab**: the provider contract — base URL, API key, primary model (`模型`), and the background model (`后台模型`) — on the single OpenAI-compatible source, plus the Connect/Test actions and the live connection-status pill routed through the runtime command port. On the standalone page (no workspace runtime) Connect/Test call `/api/backends/chat-completions/status` and `/api/backends/chat-completions/generate` directly with the current form values, and the pill tracks the last page-side result instead of the workspace provider state. The background model reuses the same URL and key and is also the model used for conversation-memory summarization when set; there is no fallback credential, reverse-proxy field, or connection-profile picker on this surface. Prompt post-processing is not a field: the server always applies strict normalization before forwarding chat-completion requests.
3a. **对话记忆 section**: conversation-memory controls bound to `oai_settings.chat_memory_*` — history summarization toggle (on by default), retained full-display turn count, summary injection role (system/assistant/user), per-summary max output tokens, summary prompt, and summary wrapper template with a `{{summary}}` placeholder.
    These are global defaults. The delivered [current-chat memory panel](feature.chat_memory) is a separate chat-options entry alongside `链路日志`. Its inheritance, override and per-field `恢复默认` controls affect only the open chat; they do not change these global defaults.
4. **Fixed interface preferences**: chat width (50vw), font scale (1), chat display (default style), timestamps (on), compact input (on), message token count (off), media display (list), send-on-enter (automatic), generated-markdown auto-fix (off), external media (forbidden by default with per-entity overrides), fast UI mode / no shadows (on), and reduced motion (OS preference) are fixed constants, not fields. Stored `power_user.custom_css` no longer applies and is stripped on load and save; the remaining interface keys are stripped from saved payloads.
5. **Fixed generation/runtime defaults**: tokenizer is always best-match, token padding is fixed at 64 (`TOKEN_PADDING`), message/prompt trimming is always on, `{{char}}` name forcing is always on (still disabled during impersonation), smooth streaming is off, STscript matching is fixed `fuzzy`, and autocomplete always shows. Stopping strings are only ephemeral `/gen stop=...` or per-message `/send`-style bias. System-instruction authoring lives in per-character card `system_prompt`; reasoning parsing is fixed-on with `<think>`/`</think>` markers. Prompt assembly uses the frozen shipped defaults (`DEFAULT_CONTEXT` keeps the seeded story string with `{{wiBefore}}`/`{{wiAfter}}` injection markers, `chat_start`/`example_separator` `'***'`, and `INERT_INSTRUCT` resolves instruct macros to empty). Stored legacy `power_user` keys (`sysprompt`, `reasoning`, `instruct`, `context`, interface and advanced knobs) are stripped on load and save; per-user preset directories remain inert on-disk data.

6. **Diagnostics sidebar**: collapsed by default behind the `诊断` toggle (page header on `/settings`, save bar in the drawer variant); when expanded it shows the optional ownership ledger and payload summary for debugging.
7. **Save bar**: submits a compatibility payload derived from the loaded document while rewriting only the React-bound fields the user changed; save stays disabled until the form is dirty.
8. **消息渲染设置 section**: the Providers page ends with the merged Frontend Frames fields (enable, render depth, ignore-hidden, ordinary code collapse (all or never; frontend cards always hide source), skip highlight, blob-URL debug) bound to `power_user.frontend_frames.*` — the former `user-settings-block` drawer is retired, and the fields save through the same dirty-aware form bar. There is no render-while-streaming field: frames mount only on finalized rows, and any stored `allow_streaming` key is stripped on load and on save. Swipe arrows are always on, and the initial long-chat window is fixed at `CHAT_TRUNCATION` = 100 with load-more paginating the same step.

## Page-Level Semantic IDs

- `feature.chat_completion_select`: provider and model selection in Providers.
- `feature.custom_base_url`: the single base URL and unified key in Providers.
- `feature.fallback_provider`: the background-model field in Providers, which doubles as the summarization model.
- `page.chat_workspace`: workspace shell mounts this shared surface's drawer variant through a single Chinese `设置` entry.

## Included Features

!include feature.chat_completion_select
!include feature.custom_base_url
!include feature.fallback_provider

## Page States And Constraints

- **Sole-owner route state**: authenticated `/settings` always serves the React settings shell when the React app build exists.
- **Missing-build state**: absent `app/dist` returns HTTP 503 with rebuild instructions; there is no redirect into workspace legacy settings drawers.
- **Workspace navigation state**: the shell's single `设置` entry opens the React Settings surface as a top-center drawer (`#SettingsPanel`) on the last-used tab without leaving `/`; it shares drawer mutual exclusion, Escape, and dirty-close guarding with the other central drawers. Direct `/settings` and `/settings?tab=...` remain full-page mounts for deep links, refresh, and share; unknown `?tab=` values fall back to the first tab.
- **Generation defaults state**: preset selection, context/output limits, streaming, reasoning effort, sampling, and prompt order are edited from the workspace prompt drawer (`app/components/ai-config/AiConfigPanel.tsx`), not from `/settings`; React Settings loads and saves those `oai_settings.*` values untouched as part of the document without exposing fields for them.
- **Auth state**: unauthenticated users are redirected to login.
- **Dirty / busy / error states**: save is disabled until dirty; save/secret actions expose busy and error feedback without fake success.
- **Save state**: save posts a document-compatible payload and rewrites only changed bound fields; unknown document fields round-trip without materializing unrelated defaults.
- **Wire-log setting preservation**: recording is controlled in the workspace chat-options `链路日志` viewer, not a duplicate settings tab. Saving other settings must preserve its last successfully saved on/off choice after refresh.
- **Conflict state**: stale `settings_revision` yields HTTP 409; the page keeps the local draft visible, disables further save, and provides an explicit reload action. Reload intentionally discards that draft so the user can merge against current settings before saving again.
- **Secret state**: the single provider value uses SecretManager endpoints only and never enters settings JSON; there is no dedicated fallback secret.
- **Legacy provider normalization state**: legacy `vertexai`/`makersuite`/`palm`/`claude` sources load as OpenAI and save back as `openai`; legacy provider model keys remain stored but inert.
- **Legacy preset state**: `/api/settings/get` returns only OpenAI presets (`openai_settings`/`openai_setting_names`) plus `world_names`; `instruct`/`context`/`sysprompt`/`reasoning` preset lists and legacy provider preset lists (`koboldai`, `novelai`, `textgenerationwebui`, `quickReplyPresets`) are not returned, and `/api/presets/*` accepts only the `openai` API ID. Presets are canonical documents in `preset_documents`; `OpenAI Settings/` files were consumed once by the marker-driven init import and are inert afterwards. Stored `power_user.instruct`/`power_user.context`/`power_user.sysprompt`/`power_user.reasoning` keys are stripped on load and save.
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

- **Bootstrap**: a missing canonical document is created from `default/templates/settings-defaults.json` (`expectedRevision: 0`, conflict-safe) on the first read/write and at user-creation entry points. New users never get a `settings.json` file.
- **Get**: `/api/settings/get` may include `settings_revision` when serving from canonical SQLite. The `settings` field remains a JSON string. `world_names` is sourced from canonical `world_books` rows (directory files are import input only); `openai_settings`/`openai_setting_names` are sourced from canonical `preset_documents` rows (the `presets` slice's marker-driven init import consumed `OpenAI Settings/*.json` once — files are never read, written, or re-imported at runtime). When the presets slice is unavailable the route fails closed with HTTP 503 like the rest of the payload.
- **Save**: `/api/settings/save` accepts protocol field `settings_revision` only (document fields named `revision` are ignored). Stale revisions return HTTP 409 with the current `settings_revision` (no full document body). React Settings sends the last-loaded revision, preserves the local draft on conflict, and requires an explicit reload before another save. Clients that still omit revision use the server current revision (compat LWW) until they adopt the field.
- **File role**: `settings.json` has no runtime role at all — it is not produced, projected, read back, imported, or audited. A stray file under the user root is fully inert; nothing ingests it. The only legacy import path is `migrateUserData`, which reads pre-multi-user `public/settings.json` and writes the canonical document directly. Deliberate canonical export materializes `settings.export.json`, never the contract name.
- **Snapshots**: `/api/settings/make-snapshot` stores a canonical snapshot from the current revision. Restore creates a **new** revision; the revision counter never rewinds. Snapshot names carry a `canonical:` prefix and file-named backups are no longer listed, loaded, or restored. Legacy open `settings_projection_repairs` rows are resolved by migration v12 and no longer block writes.
- **Flags off**: when canonical feature flags cannot be resolved (direct router import outside `server.js`), most settings endpoints return HTTP 503 `canonical_storage_unavailable` instead of touching a file. Snapshot listing (`/api/settings/get-snapshots`) instead returns HTTP 200 with `[]`, and `/api/settings/load-snapshot` returns HTTP 404. The `slices.settings.projection` config key is deprecated: it is ignored with a one-time warning.
- **Not in this authority**: secrets, and later feature/media normalizations that still live nested in the document for compatibility.
