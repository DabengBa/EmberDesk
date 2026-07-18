# Workspace Shell Child-Slot Coordination

## Module Responsibility

This note documents the same-entry React workspace shell at `/`. React owns the visible chrome, navigation, active/open/close/refocus/pin state, layout markers, and local status. It does not own child-feature data, backend contracts, or public extension APIs.

Declared child slots retain feature-local content and protected compatibility DOM. Their drawer classes are presentation projections, never shell state inputs. User-visible behavior is documented by [Chat Workspace](../db/pages/chat-workspace.md) and [Next Workspace Shell](../db/features/next-workspace-shell.md).

## Architecture And Constraints

- The shell always mounts from the shared workspace-panel bundle. There is no shell flag, inline workspace feature payload, strict mode, or same-version legacy fallback.
- A missing shell bundle is a release-gate failure. Operational rollback deploys the prior application version.
- `app/workspace-panels.tsx` owns the registry, visible chrome, navigation state, local recovery UI, and shell-facing data attributes.
- `app/stores/workspace-panel-store.js` owns in-memory active/open/pin snapshots and the declared child-slot contract. State is limited to the current browser page session.
- `public/script.js` owns feature-local slot activation helpers. It may project React decisions to a documented legacy host, but does not read drawer classes to determine active, pinned, or closed shell state.
- `app/compat/global-compatibility-bridge.js` exposes a sanitized `workspacePanelDock` snapshot for internal diagnostics only. It does not replace `globalThis.SillyTavern`, `eventSource`, `event_types`, or `@sillytavern/*`.
- Protected extension mounts, message and character selectors, slash commands, and regex behavior remain compatibility contracts. The shell cannot remove them as incidental cleanup.

## Core Implementation

1. The React shell registry exposes AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring. AI Config, Formatting, and Settings route to React Settings.
2. Each child slot declares a stable key, mount target, accessible name, content owner, and allowed feature-local capabilities in `WORKSPACE_SHELL_CHILD_SLOTS`.
3. A slot click records a React dock intent before the shell invokes `activateWorkspaceShellSlot`. Settled mount results update only the React store; a sequence guard ignores stale async results.
4. Closing a slot calls `deactivateWorkspaceShellSlot`. React clears the active state after its own transition, then projects the close to the declared host.
5. Pinning updates the React store first with `recordWorkspacePanelDockPin`; `setWorkspaceShellSlotPinned` only projects that decision to the child host.
6. Slot activation waits one macrotask before touching legacy-hosted content so React button handling does not compete with old document listeners. World Info still preloads the deferred `world-info-body` content before its slot opens.
7. Slot failures produce a local error status and Retry action while shell navigation, chat rows, and composer remain reachable.

## Related Semantic IDs And Code Binding Points

Related semantic IDs:

- `page.chat_workspace`
- `feature.next_workspace_shell`
- `feature.character_library_panel`
- `feature.group_authoring`
- `feature.world_info_panel`
- `feature.background_library_panel`
- `feature.extension_panel_open`

Current code binding points:

- `app/stores/workspace-panel-store.js`
- `app/compat/global-compatibility-bridge.js`
- `app/workspace-panels.tsx`
- `public/script.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `public/style.css`
- `tests/react-state-stores.test.js`
- `tests/global-compatibility-bridge.test.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-workspace-structure.test.js`
- `tests/workspace-shell-panel-navigation.e2e.js`

Related deeper docs:

- [ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md)
- [ADR-0012: Retire Legacy Runtime Owners From Migrated React Surfaces](../adr/0012-react-migrated-surface-legacy-retirement.md)
