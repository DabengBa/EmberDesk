---
id: feature.character_library_panel
type: feature
name: Character Library Panel
related: [page.chat_workspace, feature.character_delete, feature.character_export, feature.character_text_replace, term.character_card]
---

# Feature: Character Library Panel

## ID 解释

`feature.character_library_panel` represents the library surface where a user browses, imports, authors, organizes, and selects [character cards](term.character_card). It covers browsing and edit affordances and the visible state after import or bulk actions; it does not cover the card concept itself or the separate chat workspace.

## Purpose

Give a user one place to find, bring in, edit, organize, and activate [character cards](term.character_card) while keeping library state understandable during bulk operations and after imports.

## User-Visible Contract

- The library lists only characters, folders, and tags. Filtering, sorting, searching, and bulk selection operate on those rows.
- Importing a character file creates a new card; importing multiline text from a link can create multiple cards. Import results state how many cards were created, replaced, or skipped, and missing import targets are reported rather than silently dropped.
- Authoring behaves differently in create and edit modes, with existing characters editable through the same library surface. A selected card can be exported, deleted, or text-replaced without leaving the library context.
- Card tags can be managed from the card, and global tags remain available across cards. A character can declare primary and auxiliary World Info associations; stale targets are reported instead of silently accepted.
- Notes-only styles affect the card's presentation, while global styles apply broadly. A per-character grant is required for external styling associated with that card.
- Locked cards remain visible but cannot be edited.
- Large libraries remain usable: rows have predictable height, pagination keeps a manageable set visible, and bulk selection and synchronization wait for their operations before refreshing the list. Deletion keeps pagination coherent after rows are removed.
- After import or bulk actions, the visible list updates to the resulting state and names or counts reflect what actually changed.
- Character-card files in CharX or BYAF formats can be recognized; notice text explains unsupported or partially imported content rather than presenting a silent failure.

## Semantic Interaction IDs

- `feature.character_library_panel`: the full character-library browsing surface.
- `feature.character_library_panel.primary_entry`: the action that brings the character list into focus.
- `feature.character_library_panel.select_card`: choosing one [character card](term.character_card) as the active workspace context.
- `feature.character_library_panel.external_media_authorization`: the edit-mode checkbox that grants or revokes external resource loading in the active card's message CSS for its rendered rows.

## Acceptance Workflows

- As a user with many characters, open the library, search by name or tag, filter and sort the rows, then select one; EmberDesk must keep the rows readable at fixed height, apply the chosen view, and preserve a coherent page and selection after the card becomes active, and failure is an unreadable row, a hidden result, or a page reset unrelated to the selection.
- As a user importing several characters, use the import entry with multiline link text and then file import; EmberDesk must report how many cards were created or replaced, warn about missing targets, and show the resulting rows after the operation, and failure is silent skipping, duplicate rows, or a stale list that does not include imported cards.
- As a user organizing cards, add or remove card tags from a card and use global tags; EmberDesk must keep the card's tags and the global tag set distinct and make both visible in the library.
- As a user associating World Info, bind primary and auxiliary books to a card; EmberDesk must keep those associations separate from global World Info and warn when a bound target no longer exists, and failure is silently dropping the association or merging it with the global selection.
- As a user running bulk actions, select several cards and synchronize or delete them; EmberDesk must keep the selection visible, wait for the operation to finish before refreshing, report the actual count, and keep pagination valid afterward, and failure is a premature refresh, a wrong count, or a page with no usable rows.
- As a user authoring from the library, open a card in create mode and later edit an existing card; EmberDesk must present mode-appropriate fields and keep export, delete, and text-replace available from the same surface without losing library context.

## Failure Signals

- The library shows non-character rows, or filtering and sorting do not act on the visible characters, folders, and tags.
- Import reports a success count that differs from the cards shown, or missing targets disappear without a warning.
- A locked card becomes editable, or an external style appears without a per-character grant.
- Card tags and global tags are conflated, or primary and auxiliary World Info associations are merged with the global selection.
- Bulk refresh occurs before the operation completes, deletion leaves an invalid page, or the reported count is wrong.
- A CharX or BYAF import fails silently or presents unsupported content as a complete import.

## Boundaries

- The [character card](term.character_card) concept itself belongs to [Character Card](term.character_card).
- Exporting a card belongs to [Character Export](feature.character_export); deletion belongs to [Delete Character](feature.character_delete); text replacement belongs to [Character Text Replace](feature.character_text_replace).
- Message rendering behavior for cards used in chat belongs to [Chat Message Rendering](feature.chat_message_rendering).
- Import confirmation choices belong to [Unified Import Confirm](feature.unified_import_confirm).
- Chat workspace placement belongs to [Chat Workspace](page.chat_workspace).
