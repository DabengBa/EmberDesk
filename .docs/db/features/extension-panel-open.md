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

Let users open the extensions surface from the main workspace while deferred extension loading, settings mounting, and recovery stay local to that surface.

## User-Visible Contract

- Mount lifecycle compatibility for `#extensions_settings`, `#extensions_settings2`, `#regex_container`, and wand menu is gated by the `mounts` contract family (`bun run test:compat` and `third-party-extension-runtime.e2e.js`) before host-node retirement.

- Opening the extensions surface from [Chat Workspace](page.chat_workspace) must not block the whole workspace while extension discovery or activation continues.
- While deferred loading is pending, the surface shows a local placeholder; on success, installed extension settings, regex settings, and wand-menu entries remain in their established workspace locations.
- If loading fails, the surface replaces indefinite loading with a local retry affordance.
- When the guarded React host is enabled, it may own visible notify, Manage, Install, Extras API, loader, and protected-mount readiness controls while preserving the established extension content locations.
- When the same-entry React shell is enabled, its Extensions entry owns only the transient active-panel/dock state and mounted or fallback status; protected mount points, wand menu entries, regex settings, third-party extension mounting, and `@sillytavern/*` compatibility remain owned by the established extension surfaces.
- The visible Extensions surface should not present internal cutover verdict labels. Protected compatibility boundaries are a maintainer concern, not end-user copy.
- If the guarded host is disabled or cannot mount, the same workspace entry remains usable through the documented fallback surface.
- Install, update, branch switch, move, and delete operations keep the established success response shapes, but failures are distinguished as retryable, user-action-required, forbidden, or invalid-request so the Extensions surface can show actionable feedback without auto-resetting dirty Git worktrees.
- ES-module extensions can depend on [Shared Browser Library](term.shared_browser_library) for documented common browser utilities, but this feature does not redefine extension-specific behavior.
- Built-in Vector Storage is retired: extension discovery and the settings panel do not expose it, while protected extension mounts and the independent Data Bank attachment entry remain available.

## Approved Retirement Direction

The React Extensions Host is a third-wave retirement foundation. It may replace the legacy host only after supported extension content, protected mount behavior, regex/slash workflows, browser imports, and operation outcomes remain usable through a deliberate replacement contract. React must not delete those behaviors to remove the old host.

## Semantic Interaction IDs

- `feature.extension_panel_open`: the overall open-and-load behavior of the extensions surface.
- `feature.extension_panel_open.primary_entry`: the action that opens the extensions panel.
- `feature.extension_panel_open.retry`: the local retry affordance shown after a loading failure.
- `feature.extension_panel_open.react_host`: the guarded host for notify, Manage, Install, Extras API controls, loader state, and protected mount-point readiness.

## Acceptance Workflows

- As a workspace user who wants extension settings, from [Chat Workspace](page.chat_workspace) open the extensions surface while deferred loading is still in progress; EmberDesk must show local loading and eventually render extension content without blocking chat use, a refresh or reopen must return to the same panel entry, and failure is a global workspace block or extension content moved to an unexpected route.
- As a user who hits an extension load failure, from the extensions surface use the visible retry action; EmberDesk must replace the permanent spinner with retry feedback and either resolve to content or keep recoverable local error state, and failure is an endless spinner with no next action.
- As a user on a build with the guarded extension host enabled, from the React host use notify, Manage, Install, or Extras API controls; EmberDesk must route to the same established extension settings and Extras outcomes, flag-off or bundle failure must keep the fallback panel usable, and failure is missing protected extension mount points or controls that appear active but do nothing.

## Feature-Specific Evidence

- Local loading, retry, content readiness, notify/manage/install controls, Extras API fields, and visible protected-mount readiness are primary evidence.
- Protected mount points such as `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, and `#extensionsMenu` are compatibility evidence when their visible extension content remains reachable.
- `public/scripts/extensions.js` helper routing is implementation evidence for action ownership; it does not replace visible extension-panel proof.
- Install/update/switch/move/delete structured failure feedback (reason, failure class, action hints) is evidence for mutation safety; dirty worktrees must remain unmutated after blocked operations.

## Failure Signals

- Opening the extension panel blocks unrelated workspace interaction.
- A load failure leaves only a spinner.
- React and fallback surfaces disagree about whether extension content or Extras controls are available.
- Protected extension content is cloned, cleared, renamed, or moved away from the established workspace locations.
- A blocked install/update/switch/move/delete leaves no actionable distinction between retryable, user-action-required, and forbidden failures.
- A dirty extension worktree is reset, cleaned, or overwritten by update/switch/move/delete.

## Boundaries

- Root workspace readiness belongs to [Workspace Startup Bootstrap](feature.startup_bootstrap).
- The workspace shell and panel placement belong to [Chat Workspace](page.chat_workspace).
- Shared browser utility expectations belong to [Shared Browser Library](term.shared_browser_library).
- Individual extension workflows need separate semantic IDs if they become product-facing contracts.
