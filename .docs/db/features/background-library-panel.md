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
5. In builds where the guarded React migration flag is enabled, the panel can also show a React host above the existing background tabs. The host reflects loading/empty/success/error state, filter and sort controls, global/chat gallery counts, visible background rows, and upload/select/lock/unlock/auto/refresh entry points while the same underlying background controls remain available.

## Business Rules And Boundaries

- Opening the background library should not re-trigger duplicate visible loads for the same pending work.
- An explicit refresh should eventually show the newest background state even if the panel was already loading.
- The guarded React host is additive. If the migration flag is off, no extra Background Library host is inserted; if the bundle cannot mount, the legacy controls remain the behavior owner. The React host owns its visible filter/sort/gallery/action controls, but upload, delete, rename, folder assignment, background selection effects, lock behavior, thumbnail behavior, and slash-command behavior remain part of the existing background surface until a later migration explicitly changes those behavior owners.
- This feature documents visible panel behavior only, not cache or request internals.

## ID Boundary Notes

This feature is limited to the background library surface. It does not define how individual backgrounds are authored, stored, or rendered inside chats.

## Outcomes

- **Success**: the panel opens with the latest available background list.
- **Deferred catch-up**: a queued refresh can complete after the current load instead of being silently lost.
- **Migration host/action island shown**: when the guarded host is enabled, it reports loading and gallery state, exposes filter/sort and background action entry points, and delegates those actions to the existing background controls.
