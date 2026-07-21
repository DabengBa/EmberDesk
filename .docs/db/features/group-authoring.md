---
id: feature.group_authoring
type: feature
name: Group Authoring (Retired)
related: [page.chat_workspace, feature.next_workspace_shell, feature.character_library_panel, term.character_card]
---

# Feature: Group Authoring (Retired)

## ID 解释

`feature.group_authoring` previously represented the user-visible workflow for creating and editing multi-character group definitions. **Group chat product capability has been removed from EmberDesk.** This Doc ID is retained so historical links and topology remain stable; it is no longer an executable user workflow.

## Purpose

Document the retirement of group authoring. Users can no longer create, edit, save, or delete groups from the workspace.

## User-Visible Contract

- There is no Group Chats shell entry and no React Group Authoring product surface.
- `/api/groups/*` returns a stable JSON HTTP `410` with `error: group_chat_feature_removed` and does not mutate on-disk `groups/` or `group chats/` files.
- Existing group definition and group chat files may remain on disk for one compatibility period and are not auto-purged by this retirement.
- Character library lists characters (and folders/tags) only; group rows and create-group toolbar controls are gone.
- `SillyTavern.getContext().groupId` stays empty; extensions must not expect an open group session.

## Approved Retirement Direction

Delete first-party multi-character session product paths (UI, generation, authoring, group write APIs) without a long-lived feature flag. Rollback is previous-version deploy. Physical purge of user data is out of scope for the retirement slice.

## Semantic Interaction IDs

- `feature.group_authoring` — retired marker only; not a live workflow.

## Acceptance Workflows

- As a workspace user, open primary shell navigation; EmberDesk must not offer Group Chats, and failure is any control that opens group authoring or creates a group via API.
- As a stale client posting to `/api/groups/create`, EmberDesk must respond `410` JSON without writing files.

## Feature-Specific Evidence

- Missing Group Chats shell entry, missing `.group_select` product rows, and `410` group API responses are primary evidence.
- On-disk legacy group files remaining untouched after `create`/`delete` attempts prove non-destructive retirement.

## Failure Signals

- Any UI path that opens multi-character authoring or generation.
- Group API that still writes `groups/*.json` or `group chats/*.jsonl`.
- Compatibility docs that still require `.group_select` as a protected product selector.

## Boundaries

- Single-character chat, character authoring, and World Info inclusion-group fields are out of scope.
- Canonical SQLite may still contain historical `owner_type='group'` rows; new product writes must not create them.
