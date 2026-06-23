---
id: feature.background_library_panel
type: feature
name: Background Library Panel
related: [page.chat_workspace]
---

# Feature: Background Library Panel

## ID 解释

`feature.background_library_panel` represents the user-visible background library surface inside the main workspace, including opening the panel during startup-adjacent loading and refreshing it after a background-related change.

## Feature Purpose

This feature lets users view and refresh available chat backgrounds without blocking the whole workspace.

## Trigger Entry

- **Primary entry**: open the background library surface from [Chat Workspace](page.chat_workspace).
- **Refresh entry**: trigger a background refresh after a background upload or settings-related change.

## Interaction IDs

- `feature.background_library_panel`: the background library surface as a whole.
- `feature.background_library_panel.primary_entry`: opening the panel to inspect available backgrounds.
- `feature.background_library_panel.refresh`: explicitly requesting the panel to refresh its contents.
- `feature.background_library_panel.react_host`: the guarded React host/action surface that can show loading state, filter/sort controls, global/chat galleries, and legacy-backed background actions.

## User Flow

1. The user opens the background library panel.
2. If EmberDesk is already warming that panel in the background, the user waits on the same visible load rather than seeing duplicate startup behavior.
3. The user can request a refresh after changing background-related content.
4. If a refresh is requested while a current load is still finishing, EmberDesk follows with one more refresh pass so the final visible state catches up.
5. In builds where the guarded React migration flag is enabled, the panel shows a React owner host above the existing background tabs. That host reflects loading/empty/success/error state, filter and sort controls, global/chat gallery counts, visible background rows, and upload/select/lock/unlock/auto/refresh entry points while routing high-risk background behavior through explicit helpers in `public/scripts/backgrounds.js` instead of clicking legacy DOM controls.

## Business Rules And Boundaries

- Opening the background library should not re-trigger duplicate visible loads for the same pending work.
- An explicit refresh should eventually show the newest background state even if the panel was already loading.
- The guarded React host is the normal visible owner for background-library status, filter/sort state, gallery rows, and visible action entry points. If the migration flag is off or the bundle cannot mount, EmberDesk falls back to the same workspace entry as a documented emergency compatibility facade rather than a second long-term competing owner.
- Background selection, lock/unlock, folder drill-in state, lazy thumbnail lifecycle, and `/lockbg` / `/unlockbg` / `/autobg` compatibility behavior still execute inside `public/scripts/backgrounds.js`. React reaches that module through explicit helpers and post-action state resampling instead of directly clicking legacy controls.
- This feature documents visible panel behavior only, not cache or request internals.

## ID Boundary Notes

This feature is limited to the background library surface. It does not define how individual backgrounds are authored, stored, or rendered inside chats.

## Outcomes

- **Success**: the panel opens with the latest available background list.
- **Deferred catch-up**: a queued refresh can complete after the current load instead of being silently lost.
- **React owner host shown**: when the guarded host is enabled, it reports loading and gallery state, exposes filter/sort and background action entry points, and routes those actions through the `public/scripts/backgrounds.js` compatibility facade without raw DOM click bridging.
