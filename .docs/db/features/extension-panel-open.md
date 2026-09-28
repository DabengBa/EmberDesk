---
id: feature.extension_panel_open
type: feature
name: Extensions Panel Open (Retired)
related: [page.chat_workspace, term.shared_browser_library]
---

# Feature: Extensions Panel Open (Retired)

## ID 解释

`feature.extension_panel_open` previously represented the user-visible experience of opening the extensions surface from the main workspace. **Third-party extension support has been removed from EmberDesk.** This Doc ID is retained so historical links and topology remain stable; it is no longer an executable user workflow.

## Purpose

Document the retirement of the extensions surface. Users can no longer install, update, discover, manage, or mount third-party extensions from the workspace.

## User-Visible Contract

- There is no Extensions shell entry, no Extensions workspace panel, and no `#rm_extensions_block` / `#extensions_settings` / `#extensions_settings2` drawer.
- `/api/extensions/*` returns a stable JSON HTTP `410` with `error: extensions_retired` and performs no install/update/delete/move/switch/branch/discover/version work.
- The server no longer creates or serves per-user extension directories; pre-existing on-disk extension directories are left in place and are not auto-purged.
- The former Extras API host controls are removed; Connection Manager and Regex are directly initialized first-party product features, reachable through their own workspace entries.
- Message-embedded frontend frames (fenced complete HTML documents rendered as same-origin iframes) carry the retained in-message card capability; they are a first-party feature, not an extension surface.
- `globalThis.SillyTavern.getContext`, `eventSource` / `event_types`, and the `/lib.js` browser library remain internal infrastructure for first-party modules only; they are no longer a third-party extension contract.

## Approved Retirement Direction

Delete the extension-management product paths (UI, `/api/extensions/*` operations, host bridge, compatibility slots) without a long-lived feature flag. Rollback is deployment of a prior version. Physical purge of on-disk extension directories and of legacy `settings.extension_settings` keys is out of scope; the settings data bag is lazily migrated to `feature_settings` at load/save boundaries.

## Semantic Interaction IDs

- `feature.extension_panel_open`: the retired extensions surface and its product boundary.
- `feature.extension_panel_open.retirement`: the tombstone contract (`/api/extensions/*` → 410, no shell entry, no drawer, no host bridge).

## Failure Signals

- Any `/api/extensions/*` route performs work instead of returning 410.
- An Extensions navigation entry, drawer, or React host rematerializes in the workspace.
- First-party Regex or Connection Manager fails to initialize with extension machinery removed.
- Settings save/load drops `feature_settings` content or loses data held under the legacy `extension_settings` key.

## Boundaries

- First-party feature settings persistence belongs to the settings document and [Settings](page.settings) coverage.
- In-message card rendering belongs to the frontend-frame feature, not to this retired surface.
- Root workspace readiness belongs to [Workspace Startup Bootstrap](feature.startup_bootstrap); shell navigation ownership belongs to [Chat Workspace](page.chat_workspace).
