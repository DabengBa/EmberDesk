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
- Newly generated JPEG thumbnails in that flow now default to a lower quality setting (`85` instead of `95`), but existing installs with an explicit `thumbnails.quality` override must change or remove that config value first, and already-cached thumbnails must still be cleared before regeneration will actually produce lower-quality replacements.
- List-style avatar surfaces in the library flow may use native browser lazy-loading and async decoding so offscreen thumbnails do less upfront work without changing the card-selection flow.
- Those same list-style avatar images now also paint a themed placeholder background on the `<img>` surface, reducing stark white or transparent flashes while thumbnails are still loading or decoding.
- When a character card image is newly created, imported, duplicated, edited, or overwritten, EmberDesk now starts best-effort avatar thumbnail pregeneration immediately after the canonical write succeeds so the next ordinary library open is more likely to hit a ready file instead of triggering first-read thumbnail work.
- If a delayed edit response targets a card that has already been deleted from the local library, EmberDesk skips refreshing that row so the visible list stays aligned with the user's delete action.
- Character rows expose a stable DOM identity contract for list browsing and extension-adjacent scripts: `data-chid` is the standard identity, legacy `chid` remains available for older selectors, and `id="CharID${chid}"` remains the active-row and bulk-edit hook.
- During ordinary sort, search, filter, pagination, or page-size changes, the panel now keeps matching visible rows mounted when the next page is unambiguous, so safe browsing updates do not need to visibly clear and rebuild the whole list.
- If the panel is in a bogus-folder back-navigation state or the next visible page becomes ambiguous, EmberDesk may still fall back to the full list refresh path to preserve correctness instead of leaving a stale mixed view behind.
- After an ordinary unfiltered single-character delete, the panel keeps the remaining visible character rows aligned with the shifted `characters` array by rewriting `data-chid`, legacy `chid`, and `CharID${chid}` values instead of forcing a whole-list redraw or clearing the character-list container.
- After a bulk delete in an unfiltered library, the panel preserves pagination context when the after-delete page can be computed: the original page remains visible if it still exists, otherwise the panel moves to the last valid page.
- If the delete occurs in a complex browsing state such as active search/filtering, bogus-folder drilldown, ambiguous row identity, or an in-flight list print, the panel may fall back to the full list refresh path to preserve correctness.
- The character-list toolbar is grouped for scanning as a compact control surface: creation/import/group and sort controls read first, while search, grid/list, bulk edit, selected count, select-all, and delete controls stay together as the follow-up action row.
- When bulk-select mode is active, the toolbar exposes a short visible hint that character cards can be clicked to select them, so selection is not discoverable only through the checkbox or tooltip.
- Character cards in bulk-select mode keep visual selected styling, the legacy `.bulk_select_checkbox` affordance, and accessible selected/checked state synchronized on both the card row and checkbox after clicks, sorting, filtering, and pagination redraws.
- Bulk delete remains unavailable until at least one character is selected, even when the compact toolbar keeps the bulk status controls visible in the same operation context.
- Ordinary character rows keep their Character type badge in the DOM for localization and compatibility, but it is visually quiet by default so users can scan names, avatars, and tags first.
- Group rows continue to show their Group badge so mixed character/group lists remain distinguishable.
- Browsing and selecting cards belong to this feature; destructive removal belongs to [Delete Character](feature.character_delete).

## ID Boundary Notes

This feature covers browsing, visibility, and selection of character rows. Confirmation flows and irreversible removal are intentionally documented under a separate semantic ID because they are a distinct user action with different risk.

## Outcomes

- **Success**: the list appears, rows are browseable, and a selected card becomes the active workspace context.
- **Repeat-open expectation**: reopening the panel in the same session should feel like a steady-state interaction rather than a full cold rescan, because EmberDesk can reuse precomputed card summaries for this surface.
