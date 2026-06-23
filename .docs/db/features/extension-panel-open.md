---
id: feature.extension_panel_open
type: feature
name: Extensions Panel Open
related: [page.chat_workspace, term.shared_browser_library]
---

# Feature: Extensions Panel Open

## ID 解释

`feature.extension_panel_open` represents the user-visible experience of opening the extensions surface from the main workspace while its deferred loading work is still settling.

## Feature Purpose

This feature allows users to access extension controls without forcing the whole workspace to block on extension discovery and activation.

## Trigger Entry

- **Primary entry**: open the extensions surface from [Chat Workspace](page.chat_workspace).
- **Retry entry**: trigger the local retry path after an extension-surface loading failure.

## Interaction IDs

- `feature.extension_panel_open`: the overall open-and-load behavior of the extensions surface.
- `feature.extension_panel_open.primary_entry`: the action that opens the extensions panel.
- `feature.extension_panel_open.retry`: the local retry affordance shown after a loading failure.
- `feature.extension_panel_open.react_host`: the guarded React host surface for notify updates, Manage, Install, Extras API host controls, loader state, and protected mount-point readiness.

## User Flow

1. The user opens the extensions surface.
2. If the deferred extension load is still in progress, EmberDesk shows a local placeholder in that area.
3. If the deferred load succeeds, the panel fills with the extension content.
4. If the deferred load fails, EmberDesk replaces the indefinite loading placeholder with an explicit retry state.
5. Extension-specific settings and menu entries continue to appear in the established extension areas rather than moving to a separate route.
6. In builds where the guarded React migration flag is enabled, the panel shows a React owner host above the existing extensions surface. That host reports protected settings columns, regex container, wand menu, Extras API controls, and deferred loader state, and exposes notify updates, Manage, Install, Extras API URL/API key, autoconnect, and connect controls that route through explicit helpers in `public/scripts/extensions.js` instead of clicking legacy DOM controls.

## Business Rules And Boundaries

- Extension loading should not keep the entire workspace blocked.
- A loading failure must not leave the user with a permanent spinner and no next action.
- The visible extensions surface must keep installed extension settings, regex settings, and wand-menu entries reachable from their existing workspace locations.
- The guarded React host is the normal visible owner for extension-surface status, notify/manage/install controls, and Extras API controls. If the migration flag is off or the bundle cannot mount, EmberDesk falls back to the same drawer entry as a documented emergency compatibility facade rather than a second long-term competing owner.
- Protected mount points `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, and `#extensionsMenu` stay frozen compatibility nodes. React may observe and report their readiness, but it must not clone, rename, clear, or replace them.
- Extension discovery, deferred loader retries, install/manage entry orchestration, and Extras connect/autoconnect state now route through `public/scripts/extensions.js` as the compatibility facade for high-risk extension-host behavior rather than through raw DOM click/trigger bridging.
- ES-module extensions should treat [Shared Browser Library](term.shared_browser_library) as the stable source for documented common browser utilities.
- This feature describes the visible panel behavior, not extension activation internals.

## ID Boundary Notes

This semantic feature covers the panel-open contract and local recovery state only. Individual extension-specific workflows belong to future semantic docs if they need their own product-facing IDs.

## Outcomes

- **Success**: the panel opens and eventually resolves into usable extension content.
- **Failure with recovery**: the panel exposes a retry path instead of remaining in an endless loading state.
- **React owner host shown**: when the guarded host is enabled, it reports protected mount-point readiness and loader state, exposes notify/manage/install/Extras API entry points, and routes those actions through the `public/scripts/extensions.js` compatibility facade while keeping extension content mounting in the established locations.
