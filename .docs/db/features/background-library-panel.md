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
- When the guarded React host is enabled, it owns the visible background status, filters, sort controls, global/chat galleries, rows, and action entry points; if that host is unavailable, the same workspace entry remains usable through the documented fallback surface.
- When the same-entry React shell is enabled, its Backgrounds entry owns only the transient active-panel/dock state and mounted or fallback status; background selection, lock/unlock, upload, folder, thumbnail, refresh, and slash-compatible behavior remain owned by the background facade.
- Background selection, lock/unlock, folder drill-in, upload, auto-background, and slash-compatible background actions must keep the same visible results across the normal host and fallback surface.

## Semantic Interaction IDs

- `feature.background_library_panel`: the background library surface as a whole.
- `feature.background_library_panel.primary_entry`: opening the panel to inspect available backgrounds.
- `feature.background_library_panel.refresh`: explicitly requesting the panel to refresh its contents.
- `feature.background_library_panel.react_host`: the guarded host that may own visible loading, gallery, filter/sort, and action entry points while preserving the same workspace behavior.

## Acceptance Workflows

- As a workspace user who wants to inspect backgrounds, from [Chat Workspace](page.chat_workspace) open the background library while secondary panel work is still settling; EmberDesk must show local loading or gallery feedback without blocking chat use, reopening or refreshing the page must still reach the same panel entry, and failure is a global startup block, duplicate loading surfaces, or an endless blank panel.
- As a user who has changed background-related content, from the background library request refresh before or during an existing load; EmberDesk must show the final refreshed gallery state after pending work catches up, a later reopen must not show the stale pre-refresh list as current, and failure is a dropped refresh or a success-looking panel that still shows old content.
- As a user on a build with the guarded background host enabled, from the host filter/sort or background action controls operate the gallery; EmberDesk must produce the same visible selection, lock, unlock, upload, auto, or refresh outcomes as the established workspace surface, flag-off or mount failure must leave the fallback panel usable, and failure is an action entry that appears available but cannot complete or hides the established background controls.

## Feature-Specific Evidence

- Gallery counts, visible rows, loading/error labels, and action affordances are primary evidence.
- The `public/scripts/backgrounds.js` helper path and slash commands such as `/lockbg`, `/unlockbg`, and `/autobg` are compatibility evidence only when the visible panel outcome matches.
- React-host markers can support migration proof, but the contract is the user-visible background panel state and action result.

## Failure Signals

- Opening the panel blocks unrelated workspace interaction.
- Refresh requests disappear while a previous load is still pending.
- The guarded host and fallback surface show conflicting background lists or action availability.
- A failed load leaves only an indefinite spinner with no local recovery path.

## Boundaries

- Root workspace readiness belongs to [Workspace Startup Bootstrap](feature.startup_bootstrap).
- The chat workspace shell and sidebar/panel placement belong to [Chat Workspace](page.chat_workspace).
- Individual background storage, thumbnail caching, and request internals are implementation details outside this semantic feature.
