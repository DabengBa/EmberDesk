---
id: feature.character_export
type: feature
name: Character Export
related: [page.chat_workspace, feature.character_library_panel, term.character_card]
---

# Feature: Character Export

## ID 解释

`feature.character_export` represents the user-visible workflow for exporting the active [character card](term.character_card) from the main workspace. It covers choosing an export format, starting the download, keyboard handling for the export-format popup, and visible export feedback. It does not cover character-card parsing, server export internals, or importing exported files back into the library.

## Purpose

Let a user export the active [character card](term.character_card) from the workspace as a portable PNG or JSON file with an explicit format choice and visible feedback.

## User-Visible Contract

- The feature starts only after a character is already active in [Chat Workspace](page.chat_workspace) and the user chooses Export and Download from the character controls.
- EmberDesk shows a format popup with distinct PNG and JSON actions; the choices must be keyboard reachable and must not be presented as inert text.
- Opening the popup moves focus into the format choice area, Escape cancels export and returns focus to the opener, and clicking outside closes the popup without starting a download.
- Before export starts, EmberDesk preserves current character edits so the downloaded file reflects the visible active character state.
- Success and failure both produce visible toast feedback; a failed export must not imply that a download was prepared.

## Semantic Interaction IDs

- `feature.character_export`: the overall export-download workflow for the active character.
- `feature.character_export.format_popup`: the PNG/JSON chooser shown after the user starts export.
- `feature.character_export.format_select`: choosing one export format.
- `feature.character_export.feedback`: success or failure feedback after EmberDesk attempts to prepare the download.

## Acceptance Workflows

- As a character-library user who wants a portable copy, from the active character More menu choose Export and Download, select PNG or JSON in the popup, and wait for the browser download; EmberDesk must start the chosen file download and show a success toast, reopening the workspace must leave the same character selectable rather than treating export as deletion or navigation, and failure is no download, no feedback, or an exported format different from the selected action.
- As a keyboard user who wants to cancel safely, from the export popup use Tab or Escape after opening Export and Download; EmberDesk must keep PNG and JSON reachable, close without download on Escape, restore focus to the opener for Escape cancellation, and after reopen must not imply any export was started, with failure signaled by focus lost to the page body, an accidental download, or a popup that cannot be dismissed.
- As a user facing an export error, from the format popup choose a format while the export attempt fails; EmberDesk must show a failure toast and keep the active character visible for retry, a refresh or reopen must not suggest a completed export, and failure is silent no-op, success copy on failure, or lost active-character context.

## Feature-Specific Evidence

- Visible popup focus, PNG/JSON buttons, toasts, and browser download start are primary evidence.
- Export response status, saved-character calls, and file payload checks are supporting evidence only after the UI result is confirmed.
- Keyboard evidence should include focus entering the popup and Escape returning focus to the opening control.

## Failure Signals

- The format popup opens without a keyboard-reachable action.
- Escape or outside click starts an export.
- Export failure shows no toast or shows success copy.
- The active character disappears, changes selection, or reopens as a stale editor after export.

## Boundaries

- Browsing and selecting the active card belongs to [Character Library Panel](feature.character_library_panel).
- The character concept belongs to [Character Card](term.character_card).
- Importing an exported file back into the library belongs to import features, not this export contract.
