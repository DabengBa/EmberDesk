---
id: feature.prompt_panel
type: feature
name: Prompt Preset Panel
related: [page.chat_workspace, feature.next_workspace_shell, feature.character_library_panel, feature.prompt_inspector]
---

# Feature: Prompt Preset Panel

## ID 解释

`feature.prompt_panel` represents the left-side AI response configuration drawer: chat-completion preset selection and actions, sampling and template settings, and prompt ordering, toggling, and per-prompt field editing. It does not cover provider or model inputs, which live in [Settings](page.settings).

Pipeline step editors accept a free-form model name with available provider model suggestions; an empty field inherits the preset model. This is a per-step override within the existing provider, not a provider or credential switch.

## Purpose

Give power users direct in-workspace control over what is sent to the LLM: which preset is active, which prompt entries are enabled, in what order, and with what custom content — without editing files on disk.

## User-Visible Contract

- The `提示词` entry in the workspace frame opens the left drawer inside [Chat Workspace](page.chat_workspace). Its header carries only the title `预设设置档`; below it the content is grouped into `预设`, `提示词管理`, `生成参数`, and a low-frequency `高级` section.
- The panel provides the preset selector, actions to save, create, rename, import, export, delete, and restore presets, context and max-response fields, a streaming toggle, a reasoning-effort control, and an `高级` section with sampling sliders, feature toggles, character-name behavior, continue/postfix settings, and template fields. Controls reflect the current configuration; the panel is not a second source of preset data.
- In `提示词管理`, the ordered prompt entries show a drag handle, an enabled checkbox, name, role/marker/injection badges, and token count. Dragging with mouse or touch inserts the entry before or after another row; a highlighted line shows the destination, and releasing commits the order. Dragging near the scrolling edges scrolls the list. Escape, a cancelled gesture, or release outside the list leaves the order unchanged. Keyboard users can focus the handle and move one position with Up/Down. Assistive technology sees the visible names of the content editor and drag handle. The same order, enabled state, and editor state survive a move.
- Expanding a non-marker entry exposes name, role (system/user/assistant), content, injection position (relative or `@ 深度` absolute), injection depth and order (absolute only), system-prompt and forbid-overrides checkboxes, and generation-type triggers (none checked means all types), plus a delete action. With a runnable [Reply Pipeline](feature.reply_pipeline), the trigger row gains one `管线 <tool>` checkbox per step so the prompt injects only during that step's round. A maximize control opens a viewport-sized content editor; Escape or the backdrop closes it, and save writes back. `新建提示词` appends an editable entry. `查看 Prompt` opens the [Prompt Inspector](feature.prompt_inspector), a modal preview of the next send. Built-in marker entries such as `worldInfo`, `charDescription`, and `chatHistory` are placeholders injected at generation time and cannot be edited inline. The retired Chat Examples entry and its separator template are absent; older presets drop them while preserving custom prompts.
- Reordering, toggling, and editing normally save automatically and survive reload. A runtime-settings conflict pauses saving in the affected tab; follow the recovery warning in [Settings](page.settings) rather than assuming those changes persisted. Use the preset save or save-as action to store a reusable, portable preset; import and export are explicit file operations that can include or omit connection settings, but stored keys are never exported.
- Selecting a different preset applies its sampling, formatting, prompts, prompt order, extensions, and included connection fields; unsaved changes use the existing confirmation workflow. Legacy provider identifiers normalize when applied. Rename preserves the full document, including compatible unknown fields. If a new name saves but deleting the old one fails, both remain available and the partial failure is reported.
- Preset dialogs support keyboard navigation and return focus when dismissed. Switching with unsaved changes offers save, discard, or cancel; cancel leaves the current preset selected. Preset writes show busy and error feedback: failed saves retain edits, and failed deletes keep the preset available.
- Numeric controls retain native keyboard stepping and allow unfinished input while editing. Invalid input remains visible with a field error after leaving the control; it does not replace the last valid configuration value. Preset saving uses that last valid value until the input is corrected.
- The panel defaults to Simplified Chinese and follows the shared language setting, including English source-text labels.
- On a fresh account with no stored drawer preference, both side panels start open and locked on a wide desktop and closed and unlocked on narrow or mobile screens; an explicit user choice overrides that default on later visits. No pin or lock control appears in the panel or frame.

## Semantic Interaction IDs

- `feature.prompt_panel`: the overall left-drawer prompt preset surface.
- `feature.prompt_panel.preset_select`: choosing the active chat-completion preset.
- `feature.prompt_panel.preset_save`: saving, saving-as, renaming, importing, exporting, or deleting a preset.
- `feature.prompt_panel.settings_fields`: context size, max response, streaming, reasoning effort, sampling, and template fields bound through `settingsToUpdate`.
- `feature.prompt_panel.entry_toggle`: enabling or disabling a prompt entry.
- `feature.prompt_panel.entry_reorder`: dragging a prompt entry to a new position, or moving it with the focused handle's Up/Down keys.
- `feature.prompt_panel.entry_edit`: editing a custom prompt's name, role, content, and injection metadata.
- `feature.prompt_panel.entry_add_remove`: adding or deleting a custom prompt entry.
- `feature.prompt_panel.request_preview`: opening the [Prompt Inspector](feature.prompt_inspector) request preview from the section header.

## Acceptance Workflows

- As a user adjusting the request envelope, open `提示词`, pick a preset, drag an entry's handle past several rows, release at the highlighted destination, and toggle entries before sending; the entry must appear at its new position without changing its enabled state or closing its editor, the order must survive reload, and the next generation must use that order and enabled set. Failure is a reverted order or a saved order/toggle that does not affect the next generation.
- As a user customizing prompt text, expand a non-marker entry and edit its content; the content must persist and be used on the next request. Failure is an edit that silently reverts.
- As a user saving a tuned preset, use save or save-as; the full preset must persist and appear in the selector after reload. Failure is a preset that disappears.
- As a user with a runnable pipeline, add a `管线 <tool>` trigger to a prompt and confirm the prompt injects only during that step's round. Failure is injection outside the round or loss of the trigger after reload.
- As a first-time wide-desktop user, find both side panels open and locked; on a narrow or mobile first run both start closed and unlocked, and opening `提示词` must show the panel header and content inside the viewport. After explicitly closing a panel, reload must keep it closed.
- As a keyboard user, focus a handle and move an entry with Up/Down, then open a maximized editor and close it with Escape; the edit must only apply on save, and focus must return to the dialog when dismissed.
- As a user importing or exporting a preset, choose whether to include connection settings; stored keys must never be exported. A failed rename must not hide either preset.

## Failure Signals

- The `提示词` entry is missing or opens nothing.
- The preset selector is empty or switching presets leaves stale prompt entries.
- Reordering or toggling renders but does not change the next request.
- The panel does not persist an explicit closed state, or the first-run default overrides it.
- Panel chrome stays in the wrong language after switching settings.
- Marker entries become editable, retired Chat Examples reappear, or a failed save destroys the current edits.

## Boundaries

- Provider, base URL, key, and model selection belong to [Settings](page.settings) and [Chat Completion Provider and Model Select](feature.chat_completion_select).
- Prompt assembly, marker substitution, and message construction during generation are runtime concerns, not this panel.
- The drawer entry and panel lock behavior belong to [Next Workspace Shell](feature.next_workspace_shell).
- The right-side character list belongs to [Character Library Panel](feature.character_library_panel).
