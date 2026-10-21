---
id: feature.character_text_replace
type: feature
name: Character Text Replace
related: [page.chat_workspace, feature.character_library_panel, feature.world_info_panel, term.character_card]
---

# Feature: Character Text Replace

## ID 解释

`feature.character_text_replace` represents the user-visible workflow for running a single-character find & replace from Character Authoring. It covers the dialog opened from the authoring footer, the preview step listing every match across the three replaceable areas, per-match exclusion, and the apply step that writes the bound World Info book, the card, and the current chat through their canonical paths. It does not cover library-wide bulk replacement, renaming the card, or any historical chats other than the one currently open.

## Purpose

Let a user rename concepts, fix phrasing, or migrate terminology across the active [character card](term.character_card), its bound world book, and the currently open chat in one previewed operation, instead of editing each field by hand.

## User-Visible Contract

- The feature is reachable only for an existing character: a `查找替换` action appears in the Character Authoring footer in edit mode, not in create mode.
- The dialog collects find text, replacement text, and three match options — case-sensitive, whole-word, and regex (which keeps `$1`-style capture substitution) — plus scope checkboxes for card fields, World Info, and the current chat, each with their own field checkboxes.
- Card fields cover the editable text surface: description, scenario, first message, example dialogue, alternate greetings, system prompt, post-history instructions, depth prompt, creator notes, creator, version, and tags; the card name, avatar file, world-book binding name, chat id, and timestamps are never offered for replacement.
- World Info covers the bound book's entry content, comment, and trigger keys; when a book is bound the authoritative book is modified and the card's embedded `character_book` snapshot is refilled afterward, and an unbound card's embedded book is edited directly with its `keys`/`secondary_keys` field names.
- The preview must run before apply: it lists each match with its field path, context, and before/after samples, supports per-match exclusion, warns when the bound world book is shared by other characters, and becomes stale-invalidated whenever the user changes any search parameter afterwards.
- Apply requires an explicit confirmation of the total match count, recomputes the whole operation server-side rather than trusting the previewed diffs, and shows a per-area result summary including any failures.
- There is no built-in rollback snapshot: the dialog states that applied replacements write straight into canonical data.
- A character that is generating cannot apply — the apply is refused while a reply is in flight, and after a successful apply the current chat view is reloaded so the stale in-memory messages cannot overwrite the server result.

## Semantic Interaction IDs

- `feature.character_text_replace`: the overall find & replace workflow for one active character.
- `feature.character_text_replace.preview`: computing and reviewing matches before any write.
- `feature.character_text_replace.apply`: confirming and writing the accepted replacements.
- `feature.character_text_replace.shared_book_warning`: surfacing the bound-book sharing impact before apply.

## Acceptance Workflows

- As a character author renaming a concept, from Character Authoring open 查找替换, enter old and new text, preview, and apply; EmberDesk must update the card fields, the bound world book, and the current chat where matches were selected, remount the authoring panel with the saved content, and reload the current chat so replaced messages render, with failure signaled by unchanged canonical content, a stale in-memory chat overwriting the apply, or the card's embedded world-book snapshot disagreeing with the authoritative book.
- As a user protecting a shared world book, preview a replace that matches a bound book used by multiple characters; EmberDesk must show the sharing warning and bound-character count before apply, and failure is silently editing a shared book without surfacing that impact.
- As a user being selective, from the preview list uncheck individual matches and apply; EmberDesk must leave the excluded field paths untouched while writing the rest, and failure is an excluded path still being rewritten.
- As a user mid-generation, attempt to apply while a reply is streaming; EmberDesk must refuse the apply instead of racing the in-flight save, and failure is a chat replace that is immediately overwritten by the pending generation save.

## Feature-Specific Evidence

- Dialog presence in edit mode only, the three match options, the scope/field checkboxes, the match list with before/after samples, the exclusion toggles, the shared-book warning, the apply confirmation, and the per-area result summary are primary evidence.
- Canonical card/world/chat reads after apply are supporting evidence once the visible refresh is confirmed.

## Failure Signals

- Preview shows matches but apply silently writes different or stale content.
- Excluded matches are written anyway.
- The bound world book is edited without the shared-book warning.
- The embedded `character_book` snapshot stays stale after the authoritative book changed.
- Chat messages are replaced but the open chat view keeps serving the pre-replace in-memory copy.
- Apply proceeds while generation is in flight.
- The dialog appears in create mode or offers card name/world-binding replacement.

## Boundaries

- Browsing/selecting the card belongs to [Character Library Panel](feature.character_library_panel); the character concept belongs to [Character Card](term.character_card).
- Editing world books entry-by-entry belongs to [World Info Panel](feature.world_info_panel).
- Renaming the card (which also moves chat directories) belongs to the character rename flow, not this feature.
- Chats other than the currently open one are out of scope.
