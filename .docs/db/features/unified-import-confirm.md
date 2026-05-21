---
id: feature.unified_import_confirm
type: feature
name: Unified Import Confirmation
related: [page.chat_workspace, feature.character_library_panel, term.character_card]
---

# Feature: Unified Import Confirmation

## ID 解释

`feature.unified_import_confirm` represents the consolidated confirmation dialog shown after importing a character card, replacing 4 separate popups (tags, world book, regex scripts, CSS) with a single unified dialog.

## Feature Purpose

After importing a PNG/JSON character card, embedded content (tags, world books, regex scripts, creator notes CSS) previously triggered up to 4 independent popups at different stages of the import flow. This feature consolidates them into 1 dialog shown immediately after import, before the character is selected.

## Trigger Entry

- **Button import**: clicking the import button and selecting file(s) via the file picker.
- **Drag-drop import**: dropping character card file(s) onto the app window.

## Interaction IDs

- `feature.unified_import_confirm.scan`: scanning imported character data for embedded content.
- `feature.unified_import_confirm.dialog`: the unified confirmation dialog with checkboxes.
- `feature.unified_import_confirm.apply`: pre-setting storage keys so individual popups skip.

## User Flow

1. The user imports one or more character cards via button or drag-drop.
2. EmberDesk refreshes the character list from the server.
3. EmberDesk scans each imported character for embedded content: tags, world books, regex scripts, creator notes CSS.
4. If any embedded content is detected (and not suppressed by user settings), EmberDesk shows a **single unified confirmation dialog** with checkboxes for each content type.
5. Tags are checked by default (matching existing behavior); other items are unchecked by default.
6. If a world book name matches an existing world, the label shows "(will overwrite)".
7. The user confirms or cancels.
8. **Confirm**: EmberDesk applies the selected choices — imports tags, imports world books, enables regex scripts, sets CSS preference — and pre-sets storage keys so individual popups do not appear later.
9. **Cancel (Skip All)**: EmberDesk pre-sets all storage keys to "skip" state. Individual popups do not appear. Users can still manually import via "Import Card Lore" button, regex extension settings, etc.
10. EmberDesk imports tags (respecting the user's choice), then selects the imported character.

## Business Rules And Boundaries

- The unified dialog only appears if the character contains importable embedded content AND the corresponding user setting has not suppressed it.
- If `tag_import_setting` is not `ASK`, the tags section is hidden from the dialog (tags are imported silently or skipped per the existing setting).
- If `world_import_dialog` is `false`, the world book section is hidden.
- If no sections remain after filtering, no dialog is shown and the import proceeds normally.
- Individual popups are NOT deleted — they still serve non-import use cases (e.g., "Import Card Lore" button, `/import-tags` slash command, character switching events).
- The unified dialog uses `callGenericPopup` with `POPUP_TYPE.CONFIRM`.
- Storage pre-set mechanism: `AlertWI_${avatar}`, `AlertRegex_${avatar}`, `AllowGlobalStyles-${avatar}` in `accountStorage`.
- Batch import shows aggregated content from all imported characters in a single dialog.
- The `importCharactersTags()` function now accepts an optional `{ importSetting }` parameter to bypass the `ASK` mode when the unified dialog has already handled the decision.
- Both import entry points (button and drag-drop) share a single `handleUnifiedImport()` function to avoid logic duplication.
- If applying choices fails for one character, the error is logged and remaining characters continue processing — one failure does not block the entire import.
- When importing a world book, the `$('#import_character_info').data('chid')` DOM state is saved before and restored after the call to prevent cross-character pollution in batch imports.
- All user-visible strings in the dialog use the `t` i18n tagged template literal system.
- When batch-importing more than 3 characters, the dialog title truncates to the first 3 names plus "+N".
- World book names that match existing worlds display a styled "(will overwrite)" warning in yellow bold text.
- Characters not found after `getCharacters()` refresh are logged with `console.warn` and silently skipped.

## Outcomes

- **Success**: user selections are applied, storage keys are pre-set, individual popups are suppressed for the imported character(s).
- **Cancel**: all embedded content is skipped, storage keys are pre-set to "skip" state, no individual popups appear.
- **No content**: no dialog shown, import proceeds with existing tag import behavior.
