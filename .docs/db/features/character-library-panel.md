---
id: feature.character_library_panel
type: feature
name: Character Library Panel
related: [page.chat_workspace, feature.character_delete, term.character_card]
---

# Feature: Character Library Panel

## ID 解释

`feature.character_library_panel` represents the user-visible workflow for browsing, reopening, and selecting character cards from the main workspace. It does not include editing the card schema itself or deleting the card after confirmation.

## Feature Purpose

This feature lets users work with large character libraries without leaving the main workspace.

## Trigger Entry

- **Primary entry**: open or focus the character list area inside [Chat Workspace](page.chat_workspace).
- **Repeat entry**: reopen the same list during a normal daily-use session.

## Interaction IDs

- `feature.character_library_panel`: the full character-library browsing surface.
- `feature.character_library_panel.primary_entry`: the action that brings the character list into focus.
- `feature.character_library_panel.select_card`: choosing one [character card](term.character_card) as the active context.

## User Flow

1. The user opens or focuses the character library panel.
2. EmberDesk renders the available [character cards](term.character_card) with their summary metadata.
3. The user scrolls, searches mentally through the list, or reopens it during the same session.
4. The user selects a card to continue work in the main workspace.

## Business Rules And Boundaries

- The panel should remain usable for large libraries during ordinary repeated use.
- Summary metadata such as last-chat information should reflect the latest known state when the list is shown.
- In steady-state repeated use, EmberDesk may reuse precomputed card-summary state so reopening the panel feels faster than a full cold re-derivation of every card.
- Reopening the panel in non-Firefox browsers may also reuse short-lived cached avatar thumbnails, reducing repeated image transfer cost without changing character-card source-of-truth behavior.
- List-style avatar surfaces in the library flow may use native browser lazy-loading and async decoding so offscreen thumbnails do less upfront work without changing the card-selection flow.
- Browsing and selecting cards belong to this feature; destructive removal belongs to [Delete Character](feature.character_delete).

## ID Boundary Notes

This feature covers browsing, visibility, and selection of character rows. Confirmation flows and irreversible removal are intentionally documented under a separate semantic ID because they are a distinct user action with different risk.

## Outcomes

- **Success**: the list appears, rows are browseable, and a selected card becomes the active workspace context.
- **Repeat-open expectation**: reopening the panel in the same session should feel like a steady-state interaction rather than a full cold rescan, because EmberDesk can reuse precomputed card summaries for this surface.
