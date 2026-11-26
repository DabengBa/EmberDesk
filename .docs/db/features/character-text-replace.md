---
id: feature.character_text_replace
type: feature
name: Character Text Replace
related: [page.chat_workspace, feature.character_library_panel, feature.world_info_panel, term.character_card]
---

# Feature: Character Text Replace

## ID 解释

`feature.character_text_replace` represents the user-visible workflow for running a single-character find & replace from Character Authoring. It covers previewing and excluding matched fields and writing the confirmed replacements to the selected areas. It does not cover library-wide bulk replacement, renaming the card, or chats other than the one currently open.

## Purpose

Let a user rename concepts, fix phrasing, or migrate terminology across the active [character card](term.character_card), its bound world book, and the currently open chat in one previewed operation, instead of editing each field by hand.

## User-Visible Contract

- The feature is reachable only for an existing character: a `查找替换` action appears in the upper Character Authoring toolbar in edit mode, not in create mode.
- The dialog starts with only card fields selected. World Info and the current chat are opt-in, and each area has its own field checkboxes. Matching supports case sensitivity, whole words, and regex with capture substitution and a multiline option.
- Card fields cover the editable text surface: description, scenario, first message, example dialogue, alternate greetings, system prompt, post-history instructions, depth prompt, creator notes, creator, version, and tags; the card name, avatar file, world-book binding name, chat identifier, and timestamps are never offered for replacement.
- World Info covers the bound book's entry content, comment, and trigger keys; when a book is bound the visible book content is updated and the card's embedded copy is refreshed afterward, and an unbound card's embedded book is edited directly.
- Preview groups matched fields by area, names the bound world book and chat when applicable, and shows before/after samples. Excluding a field leaves all occurrences in that field unchanged. A shared bound book shows how many characters use it before confirmation.
- Apply requires explicit confirmation of the selected occurrence count. Changing search settings or scope requires a new preview, as does a change to the selected data after preview. Changing exclusions updates the count and clears confirmation.
- The result reports which areas were written. After a known partial write, refresh the committed areas and preview the remaining areas before applying again. If a result is lost, check whether the original apply succeeded; the dialog does not offer a new apply while the outcome is unresolved.
- There is no built-in rollback snapshot: the dialog states that applied replacements write straight into the stored data.
- A character that is generating cannot apply — the apply is refused while a reply is in flight, and a chat-scoped apply reloads the current chat view when the dialog closes so older in-memory messages cannot overwrite the result.
- While the dialog is open the authoring autosave stops firing, and closing after an apply waits for the write, re-reads the authoritative card, and only then restores the editor with the replaced content. A failed re-read keeps the dialog and the unsaved draft in place so closing can be retried; cancelling keeps unsaved edits.

## Semantic Interaction IDs

- `feature.character_text_replace`: the overall find & replace workflow for one active character.
- `feature.character_text_replace.preview`: computing and reviewing matches before any write.
- `feature.character_text_replace.apply`: confirming and writing the accepted replacements.
- `feature.character_text_replace.shared_book_warning`: surfacing the bound-book sharing impact before apply.

## Acceptance Workflows

- As a character author renaming a concept across all three areas, open `查找替换`, opt into World Info and the current chat, enter old and new text, preview, and confirm. The authoring panel and chat show the replacements, and the card's embedded book content matches the bound book.
- As a user protecting a shared world book, preview a replace that matches a bound book used by multiple characters; EmberDesk must show the sharing warning and bound-character count before apply, and failure is silently editing a shared book without surfacing that impact.
- As a user being selective, exclude a field in the preview, then confirm the updated count. The excluded field stays unchanged.
- As a user mid-generation, attempt to apply while a reply is streaming; EmberDesk must refuse the apply instead of racing the in-flight save, and failure is a chat replace that is immediately overwritten by the pending generation save.
- As a user closing after apply, close the dialog with an autosave still pending; EmberDesk must not let that older draft overwrite the replacement, and must keep the dialog open with a retryable error if the replaced card cannot be re-read.

## Failure Signals

- Preview shows matches but apply silently writes different or stale content.
- Excluded matches are written anyway.
- The bound world book is edited without the shared-book warning.
- The card's embedded book content stays stale after the bound book changed.
- Chat messages are replaced but the open chat view keeps serving the pre-replace copy.
- The editor reopens on pre-replacement text after an apply, or a failed refresh closes the dialog and leaves a stale draft behind.
- Apply proceeds while generation is in flight.
- The dialog appears in create mode or offers card name/world-binding replacement.

## Boundaries

- Browsing/selecting the card belongs to [Character Library Panel](feature.character_library_panel); the character concept belongs to [Character Card](term.character_card).
- Editing world books entry-by-entry belongs to [World Info Panel](feature.world_info_panel).
- Renaming the card belongs to the character rename flow, not this feature.
- Chats other than the currently open one are out of scope.
