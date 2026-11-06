---
id: feature.prompt_panel
type: feature
name: Prompt Preset Panel
related: [page.chat_workspace, feature.next_workspace_shell, feature.character_library_panel, feature.prompt_inspector]
---

# Feature: Prompt Preset Panel

## ID 解释

`feature.prompt_panel` represents the user-visible left-side AI response configuration drawer: chat-completion preset selection and actions, sampling and template settings, and prompt ordering, toggling, and per-prompt field editing. It restores the retired legacy AI configuration markup with stable IDs so existing `openai.js` bindings keep working, and embeds a React prompt list inside the legacy `#completion_prompt_manager` mount point. It does not cover provider or model selection, which lives in [Settings](page.settings).

Pipeline step editors accept a free-form model name with available provider model suggestions; an empty field inherits the preset model. This is a per-step override within the existing provider, not a provider or credential switch.

## Purpose

Give power users direct in-workspace control over what is sent to the LLM: which preset is active, which prompt entries are enabled, in what order, and with what custom content — without editing preset JSON on disk.

## User-Visible Contract

- The `提示词` entry in the React workspace chrome opens the left drawer panel; the drawer stays inside [Chat Workspace](page.chat_workspace) as a `fillLeft` side panel mirrored on the right-side Character drawer.
- Both side panels use the same base `clamp(340px, half-remaining-width, 420px)` width formula and render a `.workspace-panel-header` above a scrolling `.scrollableInner` body. Mobile drawer overrides take precedence at viewport widths up to 1000px; see [Workspace Shell Child-Slot Coordination](../../tech/workspace-shell-panel-dock-coordination.md) for the effective geometry and platform exceptions.
- The opened left drawer uses `height: 100vh` / `height: 100dvh` over its initial `height: 0` with an `@starting-style` growth transition; the right drawer uses `height: 100%`. Effective height is capped by applicable desktop or mobile rules, keeping the left panel header and prompt content visible and its body scrollable on the tested phone viewport.
- Inside the left panel, `.workspace-panel-header` carries only the title (`Presets`, rendered `预设设置档` under `zh-cn`) and no actions or pin control. Below the header the content is grouped into captioned sections — `预设` (preset selector, with a `.preset-actions-row` holding save, new-preset, and the preset actions menu), `提示词管理` (prompt list, whose own section header holds the Prompt Inspector and add-prompt actions), and `生成参数` (context, max response, streaming, reasoning effort) — using `.ai-config-section` separators, with the low-frequency `高级` drawer last.
- The panel restores the legacy preset selector (`#settings_preset_openai`), preset actions menu (save, save-as, rename, import, export, delete), context/max-response fields, streaming toggle, reasoning-effort segmented control, and an `高级` drawer carrying sampling sliders, feature toggles, character-name behavior, continue/postfix settings, and the impersonation/world-info/description-format/new-chat/continue-nudge/empty-message template fields. All of these keep their legacy DOM IDs so `openai.js` `settingsToUpdate` population and event handlers bind unchanged.
- Inside the `提示词管理` section, the ordered prompt entry list for the active preset renders rows with a three-line drag handle matching the Regex panel, an enabled checkbox, name, role/marker/injection badges, and token count. Hold the handle and drag with a mouse or touch to insert the entry before or after another row; a highlighted insertion line shows the destination, and releasing commits the new order. Dragging near the panel's scrolling edges scrolls the list. Escape, a cancelled pointer gesture, or releasing outside the list leaves the order unchanged. Up/down arrow buttons are absent; keyboard users can focus the handle and use Up/Down to move one position.
- Prompt controls expose their visible names to assistive technology, including the content editor and drag handle. The panel keeps the existing keyboard drag affordance while preserving the same order, enabled state, and editor state after a move.
- Expanding a non-marker prompt entry exposes name, role (system/user/assistant), content, injection position (relative vs `@ 深度` absolute), injection depth and order (absolute only), system-prompt and forbid-overrides checkboxes, and injection-trigger generation types (none checked = all types), plus a delete action. When the active preset carries a runnable reply pipeline, the trigger row gains one `管线 <tool>` checkbox per step — a prompt tagged `pipeline:<tool>` injects only during that step's round (see [Reply Pipeline](feature.reply_pipeline)). A maximize control on the content field opens a viewport-sized editing popup (Escape/backdrop closes, save writes back). A `新建提示词` button appends an editable entry. A `查看 Prompt` header action opens the [Prompt Inspector](feature.prompt_inspector), a modal preview of the request body the next send would produce. Built-in marker entries such as `worldInfo`, `charDescription`, and `chatHistory` are placeholders whose content is injected at generation time and cannot be edited inline. The retired built-in Chat Examples entry and example-chat separator template are absent from presets; loading older presets drops those retired items while preserving custom prompts.
- Reordering, toggling, and editing entries automatically saves the current configuration and survives reload. Use the preset save or save-as action to store those changes in a reusable, portable preset.
- Selecting a different preset applies the full preset payload (sampling, formatting, prompts, and prompt order) through the `applyOpenAIPreset` path driven by the restored select's change handler.
- Drawer lock state is the `.pinnedOpen` class on the host; `LNavLockOn` and `NavLockOn` store lock preferences, while `LNavOpened` and `NavOpened` store open state. No pin or lock control is rendered in the panel or shell chrome. Startup restoration, forced closure, and `setWorkspaceShellSlotPinned` can each change the class; their distinct persistence behavior is documented in [Workspace Shell Child-Slot Coordination](../../tech/workspace-shell-panel-dock-coordination.md).
- On a fresh account with no stored drawer preference, both side panels seed open and pinned on a wide desktop viewport and closed and unlocked on narrow or mobile contexts; once the user explicitly closes or unlocks a panel, the persisted `false` value suppresses the default on later visits.
- The panel content defaults to Simplified Chinese and supports the shared `en` source-text locale; every user-visible key emitted by the panel resolves through the shared i18n contract, with `zh-cn.json` providing the Simplified Chinese value.

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

- As a user adjusting the request envelope, from [Chat Workspace](page.chat_workspace) open `提示词`, pick a preset, drag an entry's three-line handle past several other rows, release at the highlighted destination, and toggle entries before sending a chat; the entry must appear at its new position without changing its enabled state or closing its editor, the order must survive reload, and EmberDesk must issue the request with the updated order and enabled set. Failure is a reverted order or a saved order/toggle that does not affect the next generation.
- As a user customizing prompt text, from the panel expand a non-marker entry and edit its content; EmberDesk must persist the content into the active preset's prompt data and use it on the next request, and failure is an edit that silently reverts or never reaches `oai_settings.prompts`.
- As a user saving a tuned preset, from the panel use save or save-as; EmberDesk must persist the full preset through `/api/presets/save` and offer it in the selector, and failure is a preset that disappears after reload.
- As a first-time user on a wide desktop viewport, open the workspace; EmberDesk must show both the left prompt panel and the right character panel open and pinned, and failure is a workspace that starts with one or both side panels closed. On a narrow or mobile first run both panels start closed and unlocked, and opening `提示词` must show the panel header and preset content inside the viewport.
- As a returning user who closed a panel, reload the workspace; EmberDesk must keep that panel closed, and failure is the default-open seed overriding an explicit stored `false`.

## Feature-Specific Evidence

- The `#left-nav-panel` drawer host with `.fillLeft`, `.openDrawer`, and `.pinnedOpen` classes, the `#settings_preset_openai` select, the `#completion_prompt_manager` list, and populated `settingsToUpdate` fields are primary evidence; the panel header and shell chrome contain no pin/lock control.
- The mobile side-panel coverage in `tests/workspace-shell-panel-navigation.e2e.js` (left drawer height and `.scrollableInner` height on a 390x844 viewport, panel switching between `提示词` and `角色库`) is layout evidence for this drawer.
- `LNavLockOn` / `LNavOpened` and `NavLockOn` / `NavOpened` accountStorage values are persistence evidence.
- `oai_settings.prompts` and `oai_settings.prompt_order` payloads in saved presets are data-contract evidence.

## Failure Signals

- The `提示词` entry is missing from shell navigation or opens nothing.
- The preset selector is empty or preset switching leaves stale prompt entries.
- Prompt reordering/toggling renders but does not change the next request's prompt assembly.
- The drawer does not persist its open or pinned state across reload, or the default-open seed overrides an explicit user-closed state.
- Panel chrome stays in English under `zh-cn`, or switching to English leaves Chinese panel chrome behind.

## Boundaries

- Provider, base URL, API key, and model selection belong to [Settings](page.settings) and [Chat Completion Provider and Model Select](feature.chat_completion_select).
- Prompt assembly, marker substitution, and message construction during generation remain runtime concerns owned by the prompt manager data layer, not this panel.
- The drawer navigation entry and drawer pin/lock state ownership belong to [Next Workspace Shell](feature.next_workspace_shell).
- The right-side character list belongs to [Character Library Panel](feature.character_library_panel).
