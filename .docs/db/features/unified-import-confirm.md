---
id: feature.unified_import_confirm
type: feature
name: Unified Import Confirmation
related: [page.chat_workspace, feature.character_library_panel, term.character_card]
---

# Feature: Unified Import Confirmation

## ID 解释

`feature.unified_import_confirm` represents the consolidated confirmation dialog shown after importing a character card, replacing 4 separate popups (tags, world book, regex scripts, CSS) with a single unified dialog.

## Purpose

Replace the chain of post-character-import popups with one immediate decision dialog for embedded tags, world books, regex scripts, and creator-note CSS.

## User-Visible Contract

- After importing one or more [character cards](term.character_card) by file picker or drag/drop, EmberDesk scans the imported cards for embedded optional content before selecting the character.
- If importable embedded content exists and the user's settings still require asking, EmberDesk shows one unified confirmation dialog with per-content checkboxes.
- Tags are selected by default when they are askable; world books, regex scripts, and CSS choices require explicit user selection unless existing settings already suppress the section.
- World book entries that would overwrite an existing world display a visible overwrite warning.
- Confirm applies only the selected choices and suppresses the older individual follow-up popups for those imported cards; cancel/Skip All records skip choices so individual popups do not appear later.
- If settings suppress all askable sections or no embedded content exists, no dialog appears and import continues through the normal character-selection path.

## Semantic Interaction IDs

- `feature.unified_import_confirm.scan`: scanning imported character data for embedded optional content.
- `feature.unified_import_confirm.dialog`: the unified confirmation dialog with visible content choices.
- `feature.unified_import_confirm.apply`: applying the selected choices and suppressing redundant follow-up popups for the import.

## Acceptance Workflows

- As a character-library user importing a card with embedded content, from [Chat Workspace](page.chat_workspace) import by button or drag/drop and review the unified dialog; EmberDesk must show one dialog with relevant sections, default tags selected, other optional content unselected, overwrite warning when needed, and after confirm the selected choices apply before the character is selected, while refresh or later character switch must not replay the old individual popups; failure is multiple popups, wrong defaults, or no visible overwrite warning.
- As a user who wants to skip embedded content, from the unified dialog choose cancel or Skip All; EmberDesk must skip all optional embedded content for that import, suppress later individual prompts for the imported cards, and leave manual import paths available, with failure signaled by skipped content appearing or individual popups returning after cancel.
- As a user importing cards with no askable embedded content or settings that suppress all sections, from either import entry complete the import; EmberDesk must select/import normally without showing an unnecessary dialog, refresh/reopen must show the imported character in the library, and failure is a blank confirmation dialog or blocked character selection.
- As a user batch-importing several cards, from the import entry select or drop multiple files and reopen the library after completion; EmberDesk must aggregate askable embedded content into one dialog with a concise title, continue processing remaining cards if one card's optional content fails, and keep completed imports visible after reopen, while failure is one optional-content error blocking the whole batch or a dialog title that becomes unusable with many names.

## Feature-Specific Evidence

- Dialog sections, checkbox defaults, overwrite labels, selected character after import, and absence of later individual popups are primary evidence.
- Account-storage suppression keys, `handleUnifiedImport()`, and tag-import options are supporting evidence only when the visible import decisions match.
- Console warnings for missing refreshed characters are diagnostic evidence, not user-visible success criteria.

## Failure Signals

- Importing one card produces several separate optional-content popups.
- Cancel/Skip All still allows later individual prompts for the same imported card.
- Existing user settings are ignored and suppressed sections appear anyway.
- A world overwrite risk is hidden from the dialog.
- One embedded-content failure stops unrelated imported cards from completing.

## Boundaries

- Character browsing and selection belong to [Character Library Panel](feature.character_library_panel).
- Character-card identity belongs to [Character Card](term.character_card).
- World Info editing and manual lorebook import belong to [World Info Panel](feature.world_info_panel).
- Extension-specific regex settings are outside this feature except for the import-time decision prompt.
