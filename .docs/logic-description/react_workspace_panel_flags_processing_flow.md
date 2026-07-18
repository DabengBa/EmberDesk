# React Workspace Shell Child-Slot Processing Flow

## Metadata

- Owner: React workspace shell lifecycle documentation
- Current code binding:
  - `app/stores/workspace-panel-store.js`
  - `app/workspace-panels.tsx`
  - `public/script.js`
  - `public/scripts/workspace-panels-react-bridge.js`
  - `tests/react-state-stores.test.js`
  - `tests/react-workspace-panels-helpers.test.js`
  - `tests/workspace-shell-panel-navigation.e2e.js`
- Related tech docs:
  - [Workspace Shell Child-Slot Coordination](../tech/workspace-shell-panel-dock-coordination.md)
- Related semantic docs:
  - [Chat Workspace](../db/pages/chat-workspace.md)
  - [Next Workspace Shell](../db/features/next-workspace-shell.md)

## Goals And Non-Goals

Goals:

- Document the always-on React workspace shell and its child-slot lifecycle.
- Make React ownership of active/open/close/refocus/pin state explicit.
- Define how feature-local hosts receive projected activation, close, and pin decisions.
- Define failure behavior without a same-version legacy shell fallback.

Non-goals:

- Document individual child-feature actions or storage behavior.
- Reintroduce a workspace feature payload, shell product flag, strict mode, or inline HTML bootstrap.
- Treat drawer classes as inputs to shell state.

## Input Discovery And Parsing Rules

Inputs:

- `slotKey`: a declared child-slot key from `WORKSPACE_SHELL_CHILD_SLOTS`.
- `slotContract`: stable key metadata containing mount target, accessible name, content owner, and allowed capabilities.
- `panelKind`: the React dock kind associated with the selected slot.
- `slotResult`: the settled result of the declared feature-local activation capability.
- `pinned`: the React-owned boolean pin decision for the current page session.

Unsupported slot keys throw before the shell changes state. Missing child hosts return a local failed result rather than selecting a legacy fallback shell.

## Outputs

- `workspacePanelDockSnapshot`: in-memory active panel kind, active status, fallback reason, open panel kinds, and pinned panel kinds.
- `workspaceShellChildSlot`: an immutable child-slot contract used by the shell registry.
- `workspaceShellSlotProjection`: feature-local host classes that reflect the React open/close/pin decision.
- `workspacePanelVisibleStatusLabel`: short visible status copy for local shell feedback.

## Staged Processing Flow

### Select and activate

1. The React registry receives a named navigation action.
2. The shell records `recordWorkspacePanelDockIntent(panelKind)` and renders the local opening state.
3. For a child slot, the shell dispatches `activateWorkspaceShellSlot(slotKey)`.
4. `public/script.js` waits one macrotask, opens the declared child host, and calls the relevant feature-local mount or action capability.
5. The React shell normalizes the settled result and records it unless a newer navigation sequence superseded it.

### Close and refocus

1. An active unpinned entry dispatches `deactivateWorkspaceShellSlot(slotKey)`.
2. The shell clears its React dock state and projects the close to the declared host.
3. An active pinned entry refocuses through activation rather than closing.

### Pin projection

1. The visible pin control requests the inverse of the current React pin state.
2. The shell calls `recordWorkspacePanelDockPin(panelKind, pinned)` after the projection capability settles.
3. The slot host receives `pinnedOpen` only as a projection. Subsequent DOM class changes do not write back to the React store.

### Local failure recovery

1. A missing host, failed activation, or failed pin projection records an error status for the affected panel.
2. The shell renders a local Retry action for that panel.
3. Chat, composer, navigation, extension mounts, and public compatibility providers remain available.

## Key Rules

- `/` always mounts React shell chrome.
- Release rollback is a prior-version deployment. Missing shell assets fail the release gate.
- Legacy DOM is permitted only as a declared child-content or compatibility host.
- Internal compatibility snapshots are diagnostic-only and cannot become public extension APIs.

## Output Schema

```json
{
  "workspacePanelDockSnapshot": {
    "activePanelKind": "worldInfo",
    "activePanelStatus": "success",
    "fallbackReason": null,
    "openPanelKinds": ["worldInfo"],
    "pinnedPanelKinds": ["worldInfo"]
  },
  "workspaceShellChildSlot": {
    "accessibleName": "World Info",
    "contentOwner": "world-info-workbench",
    "mountTarget": "#WorldInfo"
  }
}
```

## Boundaries And Failure Modes

- An unsupported slot key fails before a lifecycle transition.
- A missing declared host is a local slot error, not permission to restore legacy shell chrome.
- A failed bundle mount is a release-blocking defect; it is not a runtime compatibility path.
- A child slot may retain protected DOM and feature-local classes, but cannot own shell navigation, lifecycle, layout, local status, or pin authority.
