---
description: "This note documents the same-entry React workspace shell at /. React owns the visible chrome, navigation, active/open/close/refocus state, the recorded pin snapshot it projects to child hosts, layout markers, and local status. It does not own child-feature data, backend contracts, or..."
kind: technical
topic: workspace-shell-panel-dock-coordination
---

# Workspace Shell Child-Slot Coordination

## Module Responsibility

This note documents the same-entry React workspace shell at `/`. React owns the visible chrome, navigation, active/open/close/refocus state, the recorded pin snapshot it projects to child hosts, layout markers, and local status. It does not own child-feature data, backend contracts, or public extension APIs.

Declared child slots retain feature-local content and protected compatibility DOM. Their drawer classes are presentation projections, never shell state inputs. User-visible behavior is documented by [Chat Workspace](../db/pages/chat-workspace.md) and [Next Workspace Shell](../db/features/next-workspace-shell.md).

## Current Retirement Boundary

The global Backgrounds entry, Background Library gallery, Expressions/waifu controls, and global sprite persistence are retired. The shell registry below lists only current entries; active chat background settings/metadata, static `backgrounds/*` compatibility, avatar/persona media, and retained thumbnail behavior are separate compatibility contracts documented by Chat Workspace.

## Architecture And Constraints

- The shell always mounts from the shared workspace-panel bundle. There is no shell flag, inline workspace feature payload, strict mode, or same-version legacy fallback.
- A missing shell bundle is a release-gate failure. Operational rollback deploys the prior application version.
- `app/workspace-panels.tsx` owns the registry, visible chrome, navigation state, local recovery UI, and shell-facing data attributes.
- `app/stores/workspace-panel-store.js` owns in-memory active/open snapshots and the declared child-slot contract. State is limited to the current browser page session. Drawer pin state is the `.pinnedOpen` class on each drawer host, seeded and persisted through the legacy accountStorage lock keys; no pin or lock control is rendered in the chrome or the panels, and the chrome reads that class only to guard active-entry clicks on locked drawers.
- `public/script.js` owns feature-local slot activation helpers. It may project React decisions to a documented legacy host, but does not read drawer classes to determine active or closed shell state.
- `app/compat/global-compatibility-bridge.js` exposes a sanitized `workspacePanelDock` snapshot for internal diagnostics only. It does not replace `globalThis.SillyTavern`, `eventSource`, `event_types`, or `@sillytavern/*`.
- Protected extension mounts, message and character selectors, and regex behavior remain compatibility contracts. Slash commands are retired; the shell cannot remove the retained contracts as incidental cleanup.

## Core Implementation

1. The React shell registry exposes the declared child slots in `WORKSPACE_SHELL_CHILD_SLOTS`: Character Library (`#rm_print_characters_block`), World Info (`#WorldInfo`), Character Authoring (`#rm_ch_create_block`), Regex (`#RegexPanel`), Prompt Manager (`#left-nav-panel`), Settings (`#SettingsPanel`), and Main Chat (`#chat`, `#send_form`, `#nonQRFormItems`). Character Authoring is reached from Character Library actions rather than from primary navigation, and Settings renders as an overlay on the last-used tab.
2. Each child slot declares a stable key, mount target, accessible name, content owner, and allowed feature-local capabilities in `WORKSPACE_SHELL_CHILD_SLOTS`.
3. A slot click records a React dock intent before the shell invokes `activateWorkspaceShellSlot`. Settled mount results update only the React store; a sequence guard ignores stale async results.
4. Closing a slot calls `deactivateWorkspaceShellSlot`. React clears the active state after its own transition, then projects the close to the declared host.
5. Pinning has no rendered control. On non-mobile initialization, `public/scripts/RossAscends-mods.js` restores `.pinnedOpen` from the `LNavLockOn` / `NavLockOn` accountStorage keys. `setWorkspaceShellSlotPinned` in `public/script.js` changes the class and writes the corresponding lock key; `closeWorkspaceChildSlotHost` with `force: true` also removes the class, but writes the open-state key rather than the lock key. `recordWorkspacePanelDockPin` records a pin decision in the React store; the chrome reads the host class when handling locked drawer entries.
6. Slot activation waits one macrotask before touching legacy-hosted content so React button handling does not compete with old document listeners. World Info still preloads the deferred `world-info-body` content before its slot opens.
7. Slot failures produce a local error status and Retry action while shell navigation, chat rows, and composer remain reachable.
8. Drawer geometry is shared between `public/style.css` and the later-loaded `public/css/mobile-styles.css`. The former defines the base side-panel width, top-bar-aware maximum height, and opened left drawer's `100vh` / `100dvh` height over its initial `height: 0`; its half-remaining-width rule at up to 759px is overridden for `.drawer-content` by the latter's `width: 100dvw !important` at up to 1000px. Mobile styles also position the drawer below the top bar and set a viewport-relative height cap. On iOS (`@supports (-webkit-touch-callout: none)`), they additionally set `height` and `max-height` to `calc(100dvh - 70px)` and `max-width` to `calc(100dvw - 5px)`; these rules are not limited to the 450px media query. Effective dimensions are subject to the CSS cascade and caps, not an unconditional full-height guarantee.

## Related Semantic IDs And Code Binding Points

Related semantic IDs:

- `page.chat_workspace`
- `feature.next_workspace_shell`
- `feature.character_library_panel`
- `feature.world_info_panel`
- `feature.prompt_panel`

Current code binding points:

- `app/stores/workspace-panel-store.js`
- `app/compat/global-compatibility-bridge.js`
- `app/workspace-panels.tsx`
- `public/script.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `public/style.css`
- `public/css/mobile-styles.css`
- `tests/react-state-stores.test.js`
- `tests/global-compatibility-bridge.test.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-workspace-structure.test.js`
- `tests/workspace-shell-panel-navigation.e2e.js`

Related deeper docs:

