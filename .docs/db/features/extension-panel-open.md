---
id: feature.extension_panel_open
type: feature
name: Extensions Panel Open
related: [page.chat_workspace, term.shared_browser_library]
---

# Feature: Extensions Panel Open

## ID 解释

`feature.extension_panel_open` represents the user-visible experience of opening the extensions surface from the main workspace while its deferred loading work is still settling.

## Purpose

Let workspace users open Extensions, watch local loading and recovery, manage installed extensions, configure Extras, and keep third-party extension content reachable without blocking chat.

## User-Visible Contract

- Opening Extensions from [Chat Workspace](page.chat_workspace) shows a local loading, ready, or error/retry state inside the panel while the main workspace stays usable.
- React is the sole owner of the visible Extensions Host: notify updates, Manage, Install, Extras API URL/key/autoconnect/connect, loader status, and local retry.
- Framework-neutral extension host services own deferred discovery, dependency ordering, activation/deactivation, script/style injection, Manage/Install/update/delete/move/branch operations, and Extras connect behavior. The public `public/scripts/extensions.js` module remains a thin compatibility barrel for documented imports and helpers, not a second visible host.
- Protected compatibility slots (`#extensions_settings`, `#extensions_settings2`, `#regex_container`, and the wand menu nodes) remain stable mount points under React lifecycle ownership. Third-party content may keep its own frameworks and DOM; React does not re-render extension interiors.
- Extension operations must keep structured failure feedback (retryable, user-action-required, forbidden, invalid) and must not automatically reset or clean a user worktree.
- The panel should not surface internal migration verdict vocabulary. User-facing feedback stays on load, manage, install, update, Extras connection, and local retry results.
- When the workspace-panels build is missing, the surface fails closed with a visible build error rather than restoring a dual-owner legacy host. Rollback is deployment of a prior application version.

## Approved Retirement Direction

React is the sole runtime owner of the Extensions Host surface. Product flags and flag-off legacy drawer hosts are retired. Compatibility slots, `@sillytavern/*` aliases, `globalThis.SillyTavern`, events, slash exports, and regex placements remain supported contracts under freeze-supported policy; they are not a second product host.

## Semantic Interaction IDs

- `feature.extension_panel_open`: the overall open-and-load behavior of the extensions surface.
- `feature.extension_panel_open.primary_entry`: the action that opens the extensions panel.
- `feature.extension_panel_open.retry`: the local retry affordance shown after a loading failure.
- `feature.extension_panel_open.react_host`: the sole visible host for notify, Manage, Install, Extras API controls, loader state, and protected mount-point lifecycle.

## Acceptance Workflows

- As a workspace user who wants to open Extensions, from [Chat Workspace](page.chat_workspace) open the extensions surface while deferred loading may still be settling; EmberDesk must show local loading or ready feedback without blocking chat, protected mounts must remain reachable, and failure is a global startup block, missing mounts, or an endless blank panel.
- As a user whose deferred extension load fails, from the React host use retry; EmberDesk must re-run deferred load and present a recovered ready or explicit failure state, and failure is a dead control or a success-looking panel that still has no extension content.
- As a user managing extensions, from the React host open Manage or Install and complete or fail an install/update/delete path; EmberDesk must preserve structured operation feedback and dirty/detached/collision protections, and failure is a silent no-op, automatic worktree reset, or protected mount loss.
- As a user configuring Extras, from the React host set URL/key/autoconnect and connect; EmberDesk must keep secret handling and connection status scoped to the Extensions surface, and failure is a workspace-wide block or lost connection feedback.
- As a user with supported third-party extensions such as JS-Slash-Runner, Regex Manager, or Quick Reply, from Extensions open and use representative mount, event, slash, and regex paths; EmberDesk must keep documented aliases, globals, and placements working, and failure is a missing mount, broken slash/regex path, or required reinstall only because the host was modernized.
- As a user on a release where the workspace-panels build is missing, open Extensions from the same workspace entry; EmberDesk must show a visible React build error and must not re-enable a dual-owner legacy host as a product fallback.

## Feature-Specific Evidence

- React host markers, owner dataset, loader/error/retry labels, Manage/Install/Extras controls, and protected mount attachment are primary evidence.
- `public/scripts/extensions.js` barrel exports, domain/service modules, and operation safety envelopes are compatibility and protocol evidence when visible outcomes match.
- Compat and runtime tests for JS-Slash-Runner, aliases, events, slash, and regex support the freeze-supported boundary without reintroducing a second visible host.

## Failure Signals

- Opening Extensions blocks unrelated workspace interaction.
- React and any residual legacy chrome present competing visible Manage/Install/Extras controls.
- Protected mounts disappear, reorder unsafely, or lose extension content after close/reopen.
- Manage/Install/update/delete appears complete while wiping a dirty worktree or dropping structured failure feedback.
- Missing workspace-panels build silently restores dual-owner legacy host controls.

## Boundaries

- Root workspace readiness belongs to [Workspace Startup Bootstrap](feature.startup_bootstrap).
- The chat workspace shell and sidebar/panel placement belong to [Chat Workspace](page.chat_workspace).
- Shared browser imports and globals belong to [Shared Browser Library](term.shared_browser_library).
- Third-party extension internals, filesystem/Git authority, and extension settings document shape remain outside this semantic feature except for their documented mount and operation contracts.
