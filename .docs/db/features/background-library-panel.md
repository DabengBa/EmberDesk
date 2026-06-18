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

## User Flow

1. The user opens the background library panel.
2. If EmberDesk is already warming that panel in the background, the user waits on the same visible load rather than seeing duplicate startup behavior.
3. The user can request a refresh after changing background-related content.
4. If a refresh is requested while a current load is still finishing, EmberDesk follows with one more refresh pass so the final visible state catches up.
5. In builds where the guarded React migration flag is enabled, the panel can also show a small status host above the existing background tabs that reflects loading/empty/success state and global/chat gallery counts while the same underlying background controls remain available.

## Business Rules And Boundaries

- Opening the background library should not re-trigger duplicate visible loads for the same pending work.
- An explicit refresh should eventually show the newest background state even if the panel was already loading.
- The guarded status host is additive. If the migration flag is off, no extra Background Library host is inserted; if the bundle cannot mount, the legacy controls remain the behavior owner. Upload, delete, rename, folder assignment, background selection, lock behavior, and slash-command behavior remain part of the existing background surface until a later migration explicitly changes those visible controls.
- This feature documents visible panel behavior only, not cache or request internals.

## ID Boundary Notes

This feature is limited to the background library surface. It does not define how individual backgrounds are authored, stored, or rendered inside chats.

## Outcomes

- **Success**: the panel opens with the latest available background list.
- **Deferred catch-up**: a queued refresh can complete after the current load instead of being silently lost.
- **Migration status shown**: when the guarded status host is enabled, it reports whether the legacy global and chat galleries are present and how many visible background items they currently expose.
