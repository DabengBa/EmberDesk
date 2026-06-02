---
id: feature.character_export
type: feature
name: Character Export
related: [page.chat_workspace, feature.character_library_panel, term.character_card]
---

# Feature: Character Export

## ID 解释

`feature.character_export` represents the user-visible workflow for exporting the active [character card](term.character_card) from the main workspace. It covers choosing an export format, starting the download, keyboard handling for the export-format popup, and visible export feedback. It does not cover character-card parsing, server export internals, or importing exported files back into the library.

## Feature Purpose

This feature lets users take a selected character out of EmberDesk as a portable PNG or JSON file without leaving the chat workspace.

## Trigger Entry

- **Character detail entry**: choose Export and Download from the active character's More menu.

## Interaction IDs

- `feature.character_export.format_popup`: the PNG/JSON format chooser shown after the user starts export.
- `feature.character_export.format_select`: choosing one export format.
- `feature.character_export.feedback`: success or failure toast shown after EmberDesk attempts to start the export download.

## User Flow

1. The user selects a [character card](term.character_card) from the character library.
2. The user opens the active character's More menu and chooses Export and Download.
3. EmberDesk shows the export-format popup with PNG and JSON actions.
4. Keyboard focus moves into the popup on the PNG option so keyboard users can immediately choose a format or Tab to JSON.
5. The user chooses PNG or JSON, or presses Escape to close the popup and return focus to the More menu trigger.
6. EmberDesk saves the current character edits before requesting the export.
7. If the export response succeeds, EmberDesk starts the file download and shows a success toast.
8. If the export response fails or the export attempt throws, EmberDesk shows a failure toast.

## Business Rules And Boundaries

- PNG and JSON are distinct format actions, not plain list text.
- Opening the popup must not leave focus behind on the page body or main navigation.
- Escape closes the popup without exporting and restores focus to the control that opened it.
- Clicking outside the popup closes it without forcing focus back to the trigger.
- Successful export feedback must be visible as a toast once the download has been prepared.
- Failed export feedback must be visible as a toast instead of silently doing nothing.
- Browsing and selecting character cards belongs to [Character Library Panel](feature.character_library_panel); this feature begins when the user asks to export an already selected character.

## ID Boundary Notes

This feature is separate from character-library browsing because export is a file-producing action with its own format choice, keyboard popup behavior, and success/failure feedback.

## Outcomes

- **Success**: a PNG or JSON download starts for the active character and a success toast confirms that the export download started.
- **Cancel**: the format popup closes without starting an export and focus returns to the More menu trigger when closed with Escape.
- **Failure**: no successful download is implied; EmberDesk shows an error toast.
