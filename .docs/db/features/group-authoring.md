---
id: feature.group_authoring
type: feature
name: Group Authoring
related: [page.chat_workspace, feature.next_workspace_shell, feature.character_library_panel, term.character_card]
---

# Feature: Group Authoring

## ID 解释

`feature.group_authoring` represents the user-visible workflow for creating, editing, saving, and deleting group definitions from the main workspace. It covers the authoring surface and member-management behavior, not the group file format or the separate group-chat runtime itself.

## Purpose

Let users manage group identity, members, ordering, and save state from one compact workspace panel without leaving the current chat shell.

## User-Visible Contract

- The Group Chats workspace entry stays inside [Chat Workspace](page.chat_workspace); React Group Authoring is the sole runtime owner for create/edit fields in the existing right drawer.
- The legacy group form is hidden while React owns the surface and is not a product rollback path. Missing workspace-panels builds fail closed with a visible build error instead of re-enabling a dual-owner editor.
- The React authoring surface covers name, avatar URL, favorite, members with non-drag reorder, activation strategy, generation mode, auto-mode delay, join prefix/suffix, and self-response / muted-sprite toggles.
- Member management must stay possible without drag-and-drop alone. Users can move members up or down through explicit controls and immediately see the new order.
- Save is the primary action, Cancel is the safe exit, and Delete remains visually separated as a danger action instead of sitting in the main save row.
- In create mode, the add-member candidate list stays compact enough that Save and Cancel remain visible in the right drawer on desktop and mobile-width layouts.
- Saving posts directly to the established group create/edit endpoints and refreshes workspace state without DOM submit completion waits or storage format changes.
- Refreshing the page and reopening the same group must show the saved name and member order. Cancel leaves stored data unchanged.

## Approved Retirement Direction

React is the sole runtime owner for group authoring fields and save flow. Previous-version deploy is the rollback path.

## Semantic Interaction IDs

- `feature.group_authoring`: the overall group create/edit surface.
- `feature.group_authoring.manage_members`: adding, removing, and reordering group members.
- `feature.group_authoring.save_group`: persisting the current group definition.

## Acceptance Workflows

- As a workspace user editing an existing group, open Group Chats from [Chat Workspace](page.chat_workspace), select a group, and review the authoring panel; EmberDesk must show the current group name and members in the React authoring surface, and failure is a stale or empty editor while the selected group is valid.
- As a user reorganizing a group, move a member up or down through the visible controls and save; EmberDesk must show the new order immediately, keep the moved member in the edited list, and preserve that order after reload, with failure signaled by a reorder control that changes nothing or reverts after save.
- As a user editing group identity, change the group name and save; EmberDesk must refresh the visible workspace state and reopen with the saved name after reload, and failure is a save that appears successful but reopens the old value.
- As a user closing the group editor without saving, make a local edit and cancel; EmberDesk must leave stored data unchanged and must not silently write the draft on close.
- As a user on a release where the workspace-panels build is missing, open Group Chats from the same workspace entry; EmberDesk must show a visible React build error and must not re-enable the legacy group form as a dual owner.

## Feature-Specific Evidence

- Visible group name, member rows, compact add-member candidates, move-up and move-down controls, save/cancel/delete actions, hidden legacy-owner state while React is mounted, and post-reload persistence are the primary evidence.
- The React owner marker for the authoring panel and the preserved right-drawer entry are evidence that the migration stayed same-entry.
- Compatibility evidence includes reuse of the established group file-backed save path and preservation of current group selection behavior after save.

## Failure Signals

- Group Chats opens an empty migration host when the legacy editor would have been usable.
- The member order changes visually but is lost after save or reload.
- Save, Cancel, and Delete appear with the same weight so the danger action is easy to trigger accidentally.
- Add-member candidates push Save and Cancel out of the visible drawer area in create mode.
- Editing a group leaves both React and legacy group owners visible and editable at the same time.

## Boundaries

- Workspace shell entry and panel dock behavior belong to [Next Workspace Shell](feature.next_workspace_shell).
- Mixed character/group browsing and row identity in the library belong to [Character Library Panel](feature.character_library_panel).
- The card concept used by group members belongs to [Character Card](term.character_card).
