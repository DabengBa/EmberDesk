---
id: feature.background_library_panel
type: feature
name: Background Library Panel
related: [page.chat_workspace]
---

# Feature: Background Library Panel

## ID 解释

`feature.background_library_panel` represents the user-visible background library surface inside the main workspace, including opening the panel during startup-adjacent loading and refreshing it after a background-related change.

## Purpose

Let workspace users inspect, select, and refresh chat backgrounds without making the entire workspace wait for background-library loading work.

## User-Visible Contract

- Opening the background library from [Chat Workspace](page.chat_workspace) shows a local loading, empty, error, or gallery state inside the panel while the main workspace stays usable.
- If a background load is already in progress, the panel joins that visible work instead of starting duplicate user-facing loads.
- A user-requested refresh must eventually show the newest known background state, including the case where refresh is requested while the current load is still finishing.
- React is the sole owner of the visible background status, filters, sort controls, folders, global/chat galleries, rows, and action entry points on the same workspace Backgrounds entry.
- When the same-entry React shell is enabled, its Backgrounds entry owns only the transient active-panel/dock state and mounted status; background selection, lock/unlock, upload, rename, delete, folder, thumbnail, refresh, and slash-compatible behavior are owned by the framework-neutral background library service behind the public `backgrounds.js` barrel.
- The panel should not surface internal migration verdict vocabulary. User-facing feedback stays on gallery/loading/error/action results.
- Background selection, lock/unlock, folder drill-in, upload, rename, delete, auto-background, and slash-compatible background actions must keep the same visible results whether triggered from the React gallery or `/lockbg` / `/unlockbg` / `/autobg`.
- Renaming or deleting the active background must persist the renamed or replacement selection before the panel presents the action as complete, so an immediate refresh, reopen, or tab close cannot restore a stale filename or missing path.
- When managed background storage is enabled and has completed its integrity check, the gallery and folders can reload from the managed catalog. The visible filenames, folder membership, gallery order, thumbnail behavior, and existing background URLs remain the same.
- If managed storage is disabled or needs repair, the panel continues to use the existing background files. A failed projection after an accepted background action is treated as an action failure until it is repaired; it must not silently show a false-success gallery state.

## Approved Retirement Direction

React is the sole runtime owner of the Background Library surface. The public `backgrounds.js` barrel remains a thin service/command compatibility facade for slash commands and transport adapters. Hidden legacy gallery DOM may remain as non-visible compatibility scaffolding, but it is not a product fallback path. Rollback is deployment of a prior application version.

## Semantic Interaction IDs

- `feature.background_library_panel`: the background library surface as a whole.
- `feature.background_library_panel.primary_entry`: opening the panel to inspect available backgrounds.
- `feature.background_library_panel.refresh`: explicitly requesting the panel to refresh its contents.
- `feature.background_library_panel.react_host`: the sole visible host for loading, gallery, filter/sort, and action entry points.

## Acceptance Workflows

- As a workspace user who wants to inspect backgrounds, from [Chat Workspace](page.chat_workspace) open the background library while secondary panel work is still settling; EmberDesk must show local loading or gallery feedback without blocking chat use, reopening or refreshing the page must still reach the same panel entry, and failure is a global startup block, duplicate loading surfaces, or an endless blank panel.
- As a user who has changed background-related content, from the background library request refresh before or during an existing load; EmberDesk must show the final refreshed gallery state after pending work catches up, a later reopen must not show the stale pre-refresh list as current, and failure is a dropped refresh or a success-looking panel that still shows old content.
- As a user opening Backgrounds, from the React host filter/sort or background action controls operate the gallery; EmberDesk must produce the same visible selection, lock, unlock, upload, rename, delete, auto, or refresh outcomes as the established workspace behavior, and failure is an action entry that appears available but cannot complete or a success-looking state that does not persist.
- As a user changing the active background, rename it or delete it and then immediately refresh, close, or reopen the workspace after the panel shows completion; EmberDesk must reopen with the renamed identity or selected replacement and must not restore the old or deleted filename, and failure is a success-looking action followed by a stale or missing active background.
- As a user with managed background storage enabled, upload, rename, or delete a background and refresh the panel; EmberDesk must keep the familiar filename, folder, thumbnail, and URL behavior after reload, while a storage repair condition must leave the action visibly unsuccessful rather than presenting a changed gallery as complete.

## Feature-Specific Evidence

- Gallery counts, visible rows, loading/error labels, and action affordances are primary evidence.
- The `public/scripts/backgrounds.js` helper path and slash commands such as `/lockbg`, `/unlockbg`, and `/autobg` are compatibility evidence only when the visible panel outcome matches.
- React-host markers can support migration proof, but the contract is the user-visible background panel state and action result.

## Failure Signals

- Opening the panel blocks unrelated workspace interaction.
- Refresh requests disappear while a previous load is still pending.
- The React host and any remaining hidden gallery scaffolding show conflicting background lists or action availability.
- An active rename or delete appears complete but an immediate refresh or reopen restores the old or deleted background identity.
- A failed load leaves only an indefinite spinner with no local recovery path.

## Boundaries

- Root workspace readiness belongs to [Workspace Startup Bootstrap](feature.startup_bootstrap).
- The chat workspace shell and sidebar/panel placement belong to [Chat Workspace](page.chat_workspace).
- Individual background storage, thumbnail caching, and request internals are implementation details outside this semantic feature.
