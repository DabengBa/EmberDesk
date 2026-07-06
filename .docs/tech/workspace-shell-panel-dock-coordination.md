# Workspace Shell Panel Dock Coordination

## Module Responsibility

This note documents the current same-entry React workspace shell path that coordinates registry-backed workspace panel entries inside the existing root workspace.

It owns transient dock state, status normalization, and compatibility-snapshot boundaries. It does not own the user-visible semantics of those panels, their backend contracts, or the legacy drawer behavior itself. Those remain owned by [Chat Workspace](../db/pages/chat-workspace.md), [Next Workspace Shell](../db/features/next-workspace-shell.md), and the existing panel-specific feature docs.

## Architecture And Constraints

- `src/workspace-react-features.js` exposes `reactPages.settings`, independent panel flags, and `reactShell.{takeover,strict}` to the legacy workspace HTML before response send.
- `public/script.js` remains the runtime owner for opening and closing existing drawers and invoking the current panel facades. The React shell never bypasses that path with a second panel behavior implementation.
- `app/workspace-panels.tsx` owns the visible React chrome, navigation entry metadata, local dock loading/result bookkeeping, status normalization, and shell-facing data attributes.
- `app/stores/workspace-panel-store.js` owns the ephemeral `workspacePanelDock` snapshot. It is in-memory only, remembers the latest manual open/refocus/pinned hints for the current page session, and is reset with the browser session.
- `app/compat/global-compatibility-bridge.js` exposes a sanitized `workspacePanelDock` snapshot for internal diagnostics and migration proof. It remains internal-only and does not replace `globalThis.SillyTavern`, `eventSource`, `event_types`, or `@sillytavern/*`.
- Visible shell and panel status copy must use short user-facing phrases such as `opening`, `ready`, and `needs attention`. Raw status enums remain a diagnostics-only surface.
- The dock path must fail closed. Disabled flags, missing containers, bundle-load failures, or mount failures must keep the legacy drawer surface usable and must not create empty migration hosts.
- The dock path must not close or replace protected legacy content as incidental navigation cleanup. It coordinates panel entry state; it does not become the owner of AI configuration, formatting, settings, World Info, background file actions, extension protocols, or Character Library data flows. Character and group authoring semantics now live in the guarded React authoring panels mounted through the same drawer hosts, not in the shell registry logic.

## Core Implementation

1. The React shell renders navigation entries for AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring. Every entry carries a `panelKind` so open, close, active, pressed, and status behavior flows through one registry path.
2. When a registry-backed entry is clicked, `app/workspace-panels.tsx` stops the default button/document click chain, then records an optimistic dock intent with `recordWorkspacePanelDockIntent(panelKind)`, which sets the active panel and a transient `loading` status.
3. If the clicked entry is already active, `app/workspace-panels.tsx` calls the legacy close adapter first and only clears the dock with `recordWorkspacePanelDockClose(panelKind, result)` after the adapter result arrives. Results that report `locked` or `pinned` preserve the active dock because the legacy drawer is still visible.
4. `public/script.js` waits one macrotask before opening the legacy drawer for the selected surface so React click handling does not compete with legacy drawer listeners, then routes behavior through the existing facade or mount helper:
   - `openCharacterLibrary` opens `#right-nav-panel` and returns the feature-flag result for the dedicated Character Library bundle.
   - `openWorldInfo` preloads the deferred `world-info-body` panel before opening the drawer, then returns the settled result of the guarded React mount helper.
   - `openBackgrounds` and `openExtensions` open their existing drawers and return the settled result of the guarded React mount helpers.
   - `openAIConfig`, `openFormatting`, and `openSettings` open their established legacy drawers or route target and return a structured registry result without claiming content ownership.
   - `openGroupChats` and `openCharacterAuthoring` open their established right-drawer hosts and return the settled result of the guarded React authoring mount helpers. Those helpers fail closed to the legacy host when a flag is off, the bundle cannot mount, or the container is unavailable.
5. `closeWorkspaceShellPanel(kind)` maps the registry kind back to the established drawer and returns whether the drawer closed, remained pinned/locked, or was already unavailable. This keeps same-entry toggle semantics truthful without letting React blindly remove legacy content.
6. `getWorkspaceShellPanelDockState(kind)` reads the current drawer element and maps the legacy `.pinnedOpen` class to transient `locked` and `pinned` booleans. This preserves current drawer facts without promoting them into persisted shell state.
7. `createWorkspaceShellPanelResult(kind, resultOrMounted)` merges the settled mount/fallback result with the current dock facts. For a falsey result it returns a fallback payload with reason `feature-disabled`; for a truthy boolean it returns a mounted payload.
8. Back in `app/workspace-panels.tsx`, the result is normalized to one of `disabled`, `loading`, `empty`, `success`, or `error`. A sequence counter prevents stale async completions from overwriting a newer click's dock status.
9. The visible React shell publishes only the active-panel marker, short dock status copy, and local empty/error recovery actions for the affected surface:
   - `aria-pressed` on the active panel button
   - `data-workspace-shell-panel-active`
   - `data-workspace-panel-dock-status`
   - a short status label in the shell status area
   Diagnostics such as raw status enums, legacy slot readiness, and transient `locked` / `pinned` facts stay behind a collapsed `<details>` block or the internal compatibility snapshot instead of becoming a second visible badge system.
10. `app/compat/global-compatibility-bridge.js` snapshots `workspacePanelDock` as:
   - `activePanelKind`
   - `activePanelStatus`
   - `fallbackReason`
   - `lockedPanelKinds`
   - `openPanelKinds`
   - `pinnedPanelKinds`
   This supports diagnostics and focused proof without turning the shell into a second owner for panel behavior.

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

- `src/workspace-react-features.js`
- `public/script.js`
- `app/stores/workspace-panel-store.js`
- `app/compat/global-compatibility-bridge.js`
- `app/workspace-panels.tsx`
- `public/style.css`
- `tests/react-state-stores.test.js`
- `tests/global-compatibility-bridge.test.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-workspace-structure.test.js`
- `tests/workspace-shell-panel-navigation.e2e.js`

Related deeper docs:

- [React Workspace Panel Flags Processing Flow](../logic-description/react_workspace_panel_flags_processing_flow.md)
- [ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md)
