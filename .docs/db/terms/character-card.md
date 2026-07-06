---
id: term.character_card
type: term
name: Character Card
related: [feature.character_library_panel, feature.character_delete, page.chat_workspace]
---

# Term: Character Card

## ID 解释

`term.character_card` represents the user-facing unit EmberDesk shows in the character library, uses as a chat persona context, and edits through the workspace authoring surface. It describes the product concept, not the raw file format or parser implementation.

## Business Definition

A character card is the reusable persona package a user browses, selects, edits, duplicates, or deletes inside EmberDesk. It acts as the visible identity and metadata shell for a conversation context.

## Core Attributes

- **Display name**: the label the user recognizes in the character library.
- **Avatar image**: the visual identity shown in the list and active workspace context.
- **Summary metadata**: visible fields such as favorite state, tags, chat label, creation/added timing where surfaced, and latest chat-related summary data.
- **Chat context role**: the card becomes the active persona when selected in the workspace.
- **Authoring fields**: the card exposes editable identity and descriptive fields through the workspace authoring surface while continuing to persist through the same file-backed storage path underneath.

## Lifecycle And States

- **Available**: the card appears in the character library and can be selected.
- **Active**: the card is currently the chosen workspace context.
- **Being edited**: the card is open in the workspace authoring surface, where the user can change visible fields, review dirty/save state, and either save or cancel.
- **Removed**: the card no longer appears in the visible library after a successful delete flow.

## Related Objects

- Users browse [character cards](feature.character_library_panel) inside [Chat Workspace](page.chat_workspace).
- A card can be removed through [Delete Character](feature.character_delete).
