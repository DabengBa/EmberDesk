---
id: page.settings
type: page
name: Settings
route: /settings
related: [page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider, feature.wire_log]
---

# Page: Settings

## ID 解释

`page.settings` represents the authenticated settings surface at `/settings`. It covers model-service credentials, connection checks, conversation memory, message rendering, saving, and diagnostics. Generation choices such as sampling, limits, streaming, reasoning effort, and prompt order are edited from the workspace prompt panel instead. It does not host World Info or other specialized workflows.

## Page Purpose

Authenticated users complete supported settings work on `/settings`. The workspace `设置` entry opens the same settings surface as a top-center overlay; `/settings` remains the deep-link and full-page destination. If the settings surface is unavailable, users see a clear notice rather than a legacy form.

## Page-Level Semantic IDs

- `feature.chat_completion_select`: provider and model selection in Providers.
- `feature.custom_base_url`: the single base URL and unified key in Providers.
- `feature.fallback_provider`: the background-model field in Providers, which doubles as the summarization model.
- `page.chat_workspace`: the workspace mounts this shared surface's overlay through a single `设置` entry.

## Included Features

!include feature.chat_completion_select
!include feature.custom_base_url
!include feature.fallback_provider

## Page States And Constraints

- **Provider and probe state**: the Providers page offers one model service with a service address, secret key, primary model, and background model, plus Connect and Test actions with feedback. Both the full page and the workspace overlay use the currently shown values, including unsaved edits, for a check; testing a draft neither saves it nor changes the active connection or model. A failed check leaves the form editable and retryable. Changing the service address or model invalidates earlier feedback, including failures returned after the edit; saving or clearing the key resets feedback. Credential changes and connection checks cannot run at the same time. The background model uses the same connection and is also the model used for conversation-memory summaries when set. There is no fallback credential, proxy field, or connection-profile picker, and prompt normalization is fixed rather than configurable.
- **Conversation memory state**: global defaults control whether history is summarized, how many full turns stay visible, which role carries injected summaries, the summary length limit, and the summary prompt and wrapper. Summaries are on by default. The separate [current-chat memory panel](feature.chat_memory) under chat options can inherit or override these defaults per conversation; its controls affect only the open chat.
- **Message rendering state**: message-frame rendering can be enabled with a depth limit and choices to ignore hidden content, collapse ordinary code, and skip highlighting. Frames appear only on finalized messages, not while streaming; their settings do not narrow frame content, and the per-character style permission for ordinary messages does not apply inside a frame. That permission is the per-character checkbox in [Character Library Panel](feature.character_library_panel); its saved choices keep applying. Swipe controls are always available, and older messages load in fixed steps.
- **Surface state**: authenticated `/settings` serves the settings surface when it is available; if it is not, users see a clear rebuild notice instead of a legacy form. Unauthenticated users are sent to login.
- **Workspace navigation state**: the `设置` entry opens the settings overlay on the last-used tab without leaving the workspace; only one central overlay is shown at a time, and Escape or switching away asks before discarding unsaved edits. Direct `/settings` and `/settings?tab=...` remain full-page destinations for deep links, refresh, and sharing; an unrecognized tab falls back to the first one.
- **Generation defaults state**: preset selection, context and output limits, streaming, reasoning effort, sampling, and prompt order are edited from the workspace prompt panel, not from `/settings`; the settings surface preserves those values when loading and saving.
- **Dirty / busy / error states**: save is disabled until dirty; save/secret actions expose busy and error feedback without fake success.
- **Save state**: saving rewrites only the fields shown here that the user changed and preserves unrelated settings without inventing defaults. In the workspace overlay, saving other settings preserves the active preset and generation values, including prompt-panel changes made since settings opened. Shared fields such as conversation-memory defaults update the prompt panel's current choices and later preset saves.
- **Wire-log setting preservation**: recording is controlled in the workspace chat-options `链路日志` viewer, not a duplicate settings tab. Saving other settings must preserve its last successfully saved on/off choice after refresh.
- **Conflict state**: if another session has changed the settings, the page fetches the latest values and retries once with only the provider changes made here; other people's preset, generation, and unknown values are preserved. If both sessions changed the same provider setting differently, or the retry still conflicts, the local draft stays visible, further save is paused, and an explicit reload action is offered. Nested prompt and extension values are not automatically combined; reloading discards the draft so it can be merged manually.
- **Runtime-settings conflict**: settings work and workspace runtime saves in the same tab run one at a time. Changes to different settings in different tabs merge automatically; a list or compound setting is compared as a whole. If tabs change the same setting differently, only the conflicting fields are shown. Choose **Use mine** or **Use saved** for each field, then apply the choices without reloading. If a value changes while it is under review, only that field needs a new choice. Settings saves in that tab are paused until the conflict is resolved. The optional runtime settings download may contain sensitive values and does not include unsaved settings edits.
- **Secret state**: the provider secret uses a separate protected store and never appears in the settings document; there is no fallback secret.
- **Other saved values**: older provider and sampler choices remain stored but inactive, and older file-based presets are not used. World Info, tags, and complex managers remain outside this page even if their values appear in the settings document.

## Navigation

- Primary daily entry: workspace `设置` entry → settings overlay on [Chat Workspace](page.chat_workspace).
- Deep-link / full-page entry: `/settings` for authenticated users.
- Workspace entry: the `设置` entry opens the overlay on the last-used tab.
- Full-page return: header link back to [Chat Workspace](page.chat_workspace); the overlay closes through its own close control.
