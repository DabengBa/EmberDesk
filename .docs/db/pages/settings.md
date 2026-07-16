---
id: page.settings
type: page
name: Settings
route: /settings
related: [page.api_configuration, page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider]
---

# Page: Settings

## ID 解释

`page.settings` represents the sole React owner for authenticated general, provider/API, UI, formatting, and power-user settings at `/settings`. It covers the four tabs, secret workflows, connection-profile selection, revision-aware save, and diagnostics. It does not host World Info, Backgrounds, Extensions, or Persona Management workflows.

## Page Purpose

Authenticated users complete supported settings work on `/settings` instead of workspace Settings / AI Config / Advanced Formatting drawers. Workspace shell entries navigate here. Missing React build returns a clear rebuild error rather than a legacy drawer fallback.

## Page Structure (UI Layout)

1. **Header**: Settings title, short summary, and a return link to [Chat Workspace](page.chat_workspace).
2. **Tabs**: General, Providers, User Interface, Advanced.
3. **General tab**: chat-completion defaults, sampling, reasoning, continue, media/image request controls, prompt formats, assistant prefill, names behavior, and related oai_settings values.
4. **Providers tab**: provider/model routing, reverse proxy and custom body/headers, Vertex AI modes including service-account secret JSON, fallback provider, connection-profile selection, and provider/fallback secrets.
5. **User Interface tab**: theme, layout density, colors, chat display, message visibility, and workspace interaction preferences previously edited in the user-settings drawer.
6. **Advanced tab**: instruct/context/system-prompt/reasoning templates and sequences, tokenizer, auto-swipe/continue, streaming, and STscript controls previously edited under Advanced Formatting.
7. **Diagnostics sidebar**: optional ownership ledger and payload summary for debugging.
8. **Save bar**: submits the full settings document while rewriting only React-bound fields; save stays disabled until the form is dirty.

## Page-Level Semantic IDs

- `feature.chat_completion_select`: provider and model selection in Providers.
- `feature.custom_base_url`: reverse proxy / custom URL and secret routing in Providers.
- `feature.fallback_provider`: fallback provider configuration and dedicated fallback secret in Providers.
- `page.api_configuration`: historical workspace drawer surface; user-facing general configuration is owned by this page.
- `page.chat_workspace`: workspace shell navigates Settings / AI Config / Formatting into this route.

## Included Features

!include feature.chat_completion_select
!include feature.custom_base_url
!include feature.fallback_provider

## Page States And Constraints

- **Sole-owner route state**: authenticated `/settings` always serves the React settings shell when the React app build exists.
- **Missing-build state**: absent `app/dist` returns HTTP 503 with rebuild instructions; there is no redirect into workspace legacy settings drawers.
- **Workspace navigation state**: shell Settings opens `/settings`; AI Config opens `/settings?tab=providers`; Formatting opens `/settings?tab=advanced`.
- **Auth state**: unauthenticated users are redirected to login.
- **Dirty / busy / error states**: save is disabled until dirty; save/secret actions expose busy and error feedback without fake success.
- **Save state**: save posts the complete settings object and rewrites only bound fields; unknown document fields round-trip.
- **Conflict state**: stale `settings_revision` yields HTTP 409; the page reloads current settings and requires the user to re-check before saving again.
- **Secret state**: provider, fallback, and Vertex service-account values use SecretManager endpoints only and never enter settings JSON.
- **Vertex AI state**: legacy `vertexai` source maps to Google + Vertex enabled for editing and preserves `vertexai` on save when still enabled.
- **Specialized surfaces**: World Info, Extensions, Personas, tags, and complex managers such as bias preset tables remain outside this page even if related values appear in the settings document.

## Navigation

- Primary entry: `/settings` for authenticated users.
- Workspace chrome: Settings / AI Config / Formatting navigate into this page.
- Return: header link back to [Chat Workspace](page.chat_workspace).

## Canonical Settings Document Authority

When the effective Settings storage flags enable reads/writes and the `settings` audit scope is
clean, the full settings JSON document is authoritative in per-user
`storage/emberdesk.sqlite` (`settings_documents`) with a monotonic `revision`. Operators may keep
the existing global storage flags or explicitly enable this settings slice; absent settings-slice
values retain the global behavior.

- **Get**: `/api/settings/get` may include `settings_revision` when serving from canonical SQLite. The `settings` field remains a JSON string. Directory-derived payload fields (presets, themes, world names, etc.) stay file/directory aggregates and are not part of the settings document.
- **Save**: `/api/settings/save` accepts protocol field `settings_revision` only (document fields named `revision` are ignored). Stale revisions return HTTP 409 with the current `settings_revision` (no full document body). React Settings sends the last-loaded revision and reloads/warns on conflict. Clients that still omit revision use the server current revision (compat LWW) until they adopt the field.
- **Projection**: After a successful DB commit, the server projects `settings.json`. Projection failure keeps the DB revision, records `settings_projection_repairs`, and returns 500 with a repair key.
- **Snapshots**: `/api/settings/make-snapshot` stores a canonical snapshot from the current revision and may also keep a file backup. Restore creates a **new** revision; the revision counter never rewinds. Open projection repairs block write rollback.
- **Flags off**: Existing atomic `settings.json` read/write continue to work; file writes invalidate the settings audit until re-audited.
- **Not in this authority**: secrets, and later persona/extension/media normalizations that still live nested in the document for compatibility.
