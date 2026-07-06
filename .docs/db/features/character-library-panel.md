---
id: feature.character_library_panel
type: feature
name: Character Library Panel
related: [page.chat_workspace, feature.character_delete, feature.character_export, term.character_card]
---

# Feature: Character Library Panel

## ID 解释

`feature.character_library_panel` represents the user-visible workflow for browsing, reopening, and selecting character cards from the main workspace. It does not include editing the card schema itself or deleting the card after confirmation.

## Purpose

Let users browse, search, filter, sort, bulk-select, and choose [character cards](term.character_card) from the main workspace without moving to a separate route.

## User-Visible Contract

- The character-library entry point stays inside [Chat Workspace](page.chat_workspace); the guarded React panel is the normal visible owner for list/search/sort/bulk browsing state, with the legacy panel retained only as a documented flag-off or bundle-failure fallback.
- When the same-entry React shell is enabled, its Character Library entry owns the transient dock/active-panel state and reports mounted or fallback status while the character-library panel remains the owner of browsing, row identity, selection, and bulk state.
- Opening an existing character from the library keeps the established workspace selection behavior, but the normal visible owner for create/edit authoring inside the right drawer is now the guarded React Character Authoring panel; the legacy form remains only as the hidden compatibility host or rollback fallback.
- When the Character Management lock is enabled, the character-library panel remains open while users open supporting drawers such as World Info; when it is not locked, opening another drawer may close it to keep the workspace uncluttered.
- The panel remains usable for large libraries by keeping pagination, virtualized visible rows for very large page sizes, lazy avatar behavior, and steady-state reopen performance focused on the current browsing task.
- Character rows show current card metadata, avatars, tags, favorite state, last-chat summaries, and mixed character/group/folder identity without changing the user's list definition during search, sort, filtering, or pagination.
- Search, sort, tag filters, page size changes, and pagination should update the visible list without unnecessary clear-and-rebuild churn when the next page is unambiguous; ambiguous states may fall back to a full refresh for correctness.
- Character row identity remains stable for browsing, active-card state, bulk selection, and compatible extension selectors.
- Bulk-select mode provides visible selection hints, synchronized selected styling and checked state, selected count, select-all controls, and disabled-until-selection destructive actions.
- After delete flows, the panel keeps safe pagination context, prevents late snapshots from reintroducing deleted cards, and still falls back to full refresh for complex states when that is the clearer recovery path.

## Semantic Interaction IDs

- `feature.character_library_panel`: the full character-library browsing surface.
- `feature.character_library_panel.primary_entry`: the action that brings the character list into focus.
- `feature.character_library_panel.select_card`: choosing one [character card](term.character_card) as the active workspace context.

## Acceptance Workflows

- As a workspace user who wants to continue with a character, from [Chat Workspace](page.chat_workspace) open the character library, search or filter, sort, paginate, and select a card; EmberDesk must show the expected mixed library rows and make the chosen card active in the workspace, reopening the panel in the same session should preserve a steady-state browsing experience, and failure is a blank list, stale metadata, or selection that opens the wrong card.
- As a workspace user who wants to edit an existing character, from the library open a card and then enter Character Authoring from the same workspace; EmberDesk must show the current character values in the React authoring surface, preserve the library row identity and active selection after save, and fall back to the existing legacy editor only when the authoring flag or bundle is unavailable.
- As a user browsing a large library, from the panel choose a large page size, scroll, and change sort/search/filter state; EmberDesk must keep rows responsive with stable pagination and visible avatars/placeholders, fall back to a full refresh only for ambiguous states, and after refresh or fallback must show a coherent current list, with failure signaled by mounted-row churn that clears the list unnecessarily or leaves a stale mixed view after filter changes.
- As a user selecting cards in bulk mode, from the toolbar enter bulk select, click cards and checkboxes, sort or paginate, then review selected count and delete/tag availability; EmberDesk must keep row styling, checkbox state, accessible selected/checked state, and disabled-until-selection controls synchronized across redraws and page changes, and failure is a selected card without matching checkbox/count state or a destructive action enabled with zero selection.
- As a user returning after character deletion, from an ordinary unfiltered page delete one or more cards through [Delete Character](feature.character_delete) and return to the panel; EmberDesk must keep the original page when valid or move to the last valid page, removed rows must not return after refresh or late list snapshots, and failure is page reset, deleted-card resurrection, or active-character hooks pointing at removed rows.
- As a user on a build where the React panel is unavailable, from the same workspace entry open the fallback library surface and refresh the workspace; EmberDesk must keep browsing, selection, bulk affordances, and delete/export entry points available through the same entry, and failure is a missing route, empty migration host, or behavior split between normal and fallback surfaces.
- As a user comparing character details with World Info, from [Chat Workspace](page.chat_workspace) open Character Management, enable its lock, then open the World Info drawer; EmberDesk must leave Character Management visible while World Info opens, and failure is the locked character panel disappearing.

## Feature-Specific Evidence

- Visible rows, toolbar grouping, search/sort/filter results, pagination text, selected count, selected styling, active-card transition, avatar placeholders, and reopen behavior are primary evidence.
- Stable selectors such as `data-chid`, legacy `chid`, `id="CharID${chid}"`, and `.bulk_select_checkbox` are compatibility evidence only when the visible row and selection state match.
- Thumbnail caching, thumbnail quality, lazy decoding, pregeneration, and derived card summaries are performance evidence; they do not change the user-facing source-of-truth contract.

## Failure Signals

- The character library opens as an empty migration host while the legacy fallback would have been usable.
- Search, sort, pagination, or filtering leaves selected rows, counts, or active-card identity out of sync.
- Bulk delete is enabled with no selected character.
- Deleted cards reappear after delayed edit responses, late `/api/characters/all` snapshots, or page refresh.
- Large page sizes render every row at once and make the panel visibly unusable.

## Boundaries

- Destructive removal belongs to [Delete Character](feature.character_delete).
- Exporting the active card belongs to [Character Export](feature.character_export).
- The card concept belongs to [Character Card](term.character_card).
- Workspace shell placement belongs to [Chat Workspace](page.chat_workspace).
