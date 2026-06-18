# React Workspace Panel Flags Processing Flow

## Metadata

- Owner: React workspace panel bootstrap documentation
- Current code binding:
  - `src/workspace-react-features.js`
  - `src/server-main.js`
  - `public/script.js`
  - `public/scripts/backgrounds.js`
  - `public/scripts/background-panel-controller.js`
  - `public/scripts/extensions.js`
  - `public/scripts/workspace-panels-react-bridge.js`
  - `app/workspace-panels.tsx`
  - `default/config.yaml`
  - `vite.config.ts`
  - `tests/workspace-react-panel-flags.test.js`
  - `tests/react-workspace-panels-helpers.test.js`
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)
- Related semantic docs:
  - [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md)
  - [.docs/db/features/character-library-panel.md](../db/features/character-library-panel.md)
  - [.docs/db/features/world-info-panel.md](../db/features/world-info-panel.md)
  - [.docs/db/features/background-library-panel.md](../db/features/background-library-panel.md)
  - [.docs/db/features/extension-panel-open.md](../db/features/extension-panel-open.md)

## Goals And Non-Goals

Goals:

- Document the current workspace React feature payload exposed to the legacy workspace shell.
- Make the HTML bootstrap serialization and injection rules reproducible without importing production code.
- Document the current browser-side workspace panel bridge helper that loads the shared scaffold bundle and falls back to legacy panels when disabled, missing, or failed.
- Record that World Info, Background Library, and Extensions Host have guarded independent React host/action islands. These islands own visible React controls and bridge actions while preserving legacy behavior owners for prompt/regex/background file/extension protocol work.

Non-goals:

- Document detailed React visual layout inside any individual workspace panel.
- Describe World Info scanning, Backgrounds upload/delete/selection, or Extensions API behavior.
- Replace focused Jest tests for workspace feature flags and panel helpers.

## Input Discovery And Parsing Rules

Inputs:

- `features.react.panels.characterLibrary`: controls the delivered guarded character-library panel island.
- `features.react.panels.worldInfo`: controls the current World Info independent React readiness host.
- `features.react.panels.backgroundLibrary`: controls the current Background Library independent React status host.
- `features.react.panels.extensionsHost`: controls the current Extensions Host independent React protected-mount-point status host.
- `workspaceIndexHtml`: the legacy workspace HTML string read before response send.
- `panelKind`: the requested workspace panel kind, currently one of `worldInfo`, `backgroundLibrary`, or `extensionsHost` for the shared scaffold bundle.
- `panelContainer`: the independent host element passed to the shared React workspace-panel bridge.
- `worldInfoReactHost`: the DOM element created inside `#wiEditorPanel` before `#world_popup` when the World Info flag is enabled.
- `worldInfoBridgeState`: the global selector, editor selector, import busy, drop-target readiness, selected world, entry summary, search, sort, create/import/export/refresh readiness discovered from the legacy World Info DOM.
- `worldInfoBridgeActions`: React-owned action names that delegate to existing World Info DOM controls: select world, apply search, apply sort, create/import/export/refresh, and open entry.
- `backgroundLibraryReactHost`: the DOM element created inside `#Backgrounds` before `#bg_tabs` when the Background Library flag is enabled.
- `backgroundLibraryBridgeState`: the loading, empty/success/error, global-gallery, chat-gallery, filter, sort, folder, selected, locked, and visible item state discovered from the legacy Backgrounds DOM and background state-change events; optional bridge overrides can carry error or queued-refresh values.
- `backgroundLibraryBridgeActions`: React-owned action names that delegate to existing Background DOM controls: apply filter/sort, upload, select, lock, unlock, auto, and refresh.
- `extensionsHostReactHost`: the DOM element created inside `#rm_extensions_block` before `.extensions_block` when the Extensions Host flag is enabled.
- `extensionsHostBridgeState`: the protected mount-point, Extras API controls, notify, autoconnect, Extras URL/key presence, Extras status text, and deferred loader state discovered from the legacy Extensions DOM and extension state-change events.
- `extensionsHostBridgeActions`: React-owned action names that delegate to existing Extensions DOM controls: toggle notify, open Manage, open Install, update Extras URL/API key, connect Extras, and toggle autoconnect.
- `workspacePanelBundle`: the dynamic import result for `/react/login/assets/workspace-panels.js`.

Missing or non-boolean panel flags resolve to `false`. The default config keeps all workspace panel flags off except where a local config or environment override explicitly enables one. The browser mount wrappers check the matching flag before creating an independent host or reading bridge state, so a disabled flag does not leave an empty React host in the legacy panel.

## Outputs

The processing outputs are:

- `workspaceReactFeatures`: the object exposed to the browser as `window.__emberDeskWorkspaceFeatures`.
- `workspaceReactFeaturesScript`: the escaped inline bootstrap script.
- `workspaceReactFeaturesHtml`: the workspace HTML with the bootstrap script inserted once.
- `worldInfoReactHost`: an idempotent `#emberdesk-react-world-info-panel-host` element placed inside the legacy World Info editor panel, or `null` when the World Info flag is disabled or the editor panel is not present.
- `worldInfoBridgeState`: a payload passed to the React workspace-panel bundle for readiness rows and visible World Info editor/import/export controls.
- `backgroundLibraryReactHost`: an idempotent `#emberdesk-react-background-library-panel-host` element placed inside the legacy Backgrounds panel before `#bg_tabs`, or `null` when the Background Library flag is disabled or the panel is not present.
- `backgroundLibraryBridgeState`: a payload passed to the React workspace-panel bundle for loading/empty/success/error state, filter/sort controls, global/chat gallery rows, and background action entry points.
- `extensionsHostReactHost`: an idempotent `#emberdesk-react-extensions-host-panel-host` element placed inside the legacy Extensions drawer before `.extensions_block`, or `null` when the Extensions Host flag is disabled or the drawer panel is not present.
- `extensionsHostBridgeState`: a payload passed to the React workspace-panel bundle for protected mount-point readiness, Extras host controls, notify/manage/install controls, and deferred loader state.
- `workspacePanelBridgeResult`: `true` only when a panel is enabled, has a container, loads the scaffold bundle, and calls `mountWorkspacePanel(kind, container, { state, bridge })`; otherwise `false` so the legacy panel remains the visible behavior owner.
- `workspacePanelModuleCache`: the browser-side dynamic import cache for the shared workspace-panel scaffold bundle.

## Staged Processing Flow

### Build workspace feature payload

1. Resolve each supported workspace panel flag from configuration.
2. Return one `reactPanels` object containing `characterLibrary`, `worldInfo`, `backgroundLibrary`, and `extensionsHost`.
3. Treat each flag independently; enabling one panel must not imply another panel is enabled.

### Serialize bootstrap script

1. JSON-serialize the workspace feature payload.
2. Escape `<`, `>`, and `&` as unicode escape sequences before embedding it in HTML.
3. Wrap the escaped payload in an inline assignment to `window.__emberDeskWorkspaceFeatures`.

### Inject into workspace HTML

1. If the HTML is empty or not a string, return it unchanged.
2. If the HTML already contains `window.__emberDeskWorkspaceFeatures`, return it unchanged to avoid duplicate bootstrap scripts.
3. If a closing `</head>` tag exists, insert the script immediately before that tag.
4. Otherwise prepend the script before the HTML body.

### Guard individual panel mount calls

1. Read the current workspace feature payload before touching panel DOM.
2. If `reactPanels.worldInfo` is false, return `false` before calling `ensureWorldInfoReactHost()` or building World Info bridge state.
3. If `reactPanels.backgroundLibrary` is false, return `false` before calling `ensureBackgroundLibraryReactHost()` or building Background Library bridge state.
4. If `reactPanels.extensionsHost` is false, return `false` before calling `ensureExtensionsHostReactHost()` or building Extensions Host bridge state.
5. Continue to host creation only for the panel whose flag is enabled.

### Create the World Info independent React host

1. This stage is reached only after the World Info flag guard passes.
2. Find `#wiEditorPanel`; if it is missing, return `null`.
3. Reuse `#emberdesk-react-world-info-panel-host` if it already exists.
4. Otherwise create a host with `class="emberdesk-react-world-info-panel-host"`.
5. Insert that host before `#world_popup` when `#world_popup` is still a direct child of `#wiEditorPanel`.
6. If `#world_popup` is absent or detached, prepend the host to `#wiEditorPanel`.
7. The host is independent from `#world_popup`; React must not clear, clone, or replace the legacy World Info popup/editor DOM.

### Build the World Info bridge state

1. Read `#world_info`, `#world_editor_select`, `#world_import_menu_item`, `#world_import_file`, and `#world_popup`.
2. Mark `globalSelectorPresent` and `editorSelectorPresent` from whether the selectors exist.
3. Mark `selectorsSeparated` only when both selectors exist and are not the same DOM node.
4. Mark `importMenuPresent` when the import menu item exists.
5. Mark `importBusy` when the import menu item has `aria-disabled="true"` or the file input is disabled.
6. Mark `dropTargetPresent` when the legacy `#world_popup` drop target exists.
7. Read `#world_info_search`, `#world_info_sort_order`, `#world_create_button`, `#world_export_menu_item`, `#world_create_world`, `#world_refresh`, and visible `#world_popup_entries_list .world_entry` cards.
8. Normalize editor world options, selected world label/value, search query, sort options, entry count, entry summaries, and create/export/refresh readiness for the React host.

### Dispatch World Info bridge actions

1. `selectWorld` sets `#world_editor_select` and triggers the legacy `change` handler.
2. `applySearchQuery` sets `#world_info_search` and triggers the legacy `input` handler.
3. `applySortOption` sets `#world_info_sort_order` and triggers the legacy `change` handler.
4. `createEntry`, `createWorld`, `importWorld`, `exportWorld`, `renameWorld`, `duplicateWorld`, `deleteWorld`, and `refreshWorld` click the existing legacy controls.
5. `openEntry` finds the matching legacy world-entry card by `uid` and clicks its expand button.
6. After action dispatch, the World Info React host refreshes bridge state; the underlying behavior remains owned by the legacy World Info modules.

### Create the Background Library independent React host

1. This stage is reached only after the Background Library flag guard passes.
2. Find `#Backgrounds`; if it is missing, return `null`.
3. Reuse `#emberdesk-react-background-library-panel-host` if it already exists.
4. Otherwise create a host with `class="emberdesk-react-background-library-panel-host"`.
5. Insert that host before `#bg_tabs` when `#bg_tabs` is still a direct child of `#Backgrounds`.
6. If `#bg_tabs` is absent or detached, prepend the host to `#Backgrounds`.
7. The host is independent from the existing background tabs and galleries; React must not clear, clone, or replace legacy background action controls.

### Build the Background Library bridge state

1. Read `#bg_menu_content`, `#bg_custom_content`, and `#bg_startup_loading`.
2. Count visible legacy background cards through `.bg_example` inside the global and chat gallery containers.
3. Merge optional state-change details such as `isLoading`; `error` and `refreshQueued` are accepted bridge inputs for future callers, but current production background events dispatch only loading state.
4. Pass the merged values through the background panel state helper so loading, empty, success, and any explicitly supplied error state stay aligned with the legacy loading controller.
5. Add container presence booleans and global/chat item counts to the state passed to the React workspace-panel bundle.
6. Normalize visible global/chat background rows from `.bg_example`, including `bgfile`, title, URL, custom/animated flags, selected state, and locked state.
7. Read `#bg-filter`, `#bg-sort`, folder view, locked count, and selected count for the React host.
8. `public/scripts/backgrounds.js` dispatches `emberdesk:background-library-state-change` when catalog loading changes; `public/script.js` listens and remounts or updates the Background Library host state.

### Dispatch Background Library bridge actions

1. `applyBackgroundFilter` sets `#bg-filter` and triggers the legacy `input` handler.
2. `applyBackgroundSort` sets `#bg-sort` and triggers the legacy `change` handler.
3. `uploadBackground` clicks `#add_bg_button`.
4. `selectBackground` finds the requested visible `.bg_example` in the global or chat gallery and clicks it.
5. `lockBackground`, `unlockBackground`, and `autoBackground` click the existing lock/unlock/auto controls.
6. `refreshBackgrounds` calls the existing `getBackgrounds({ force: true })` refresh path, then refreshes the React host state.
7. The React host owns the visible action entry points; background file operations and slash-command effects stay legacy-owned.

### Create the Extensions Host independent React host

1. This stage is reached only after the Extensions Host flag guard passes.
2. Find `#rm_extensions_block`; if it is missing, return `null`.
3. Reuse `#emberdesk-react-extensions-host-panel-host` if it already exists.
4. Otherwise create a host with `class="emberdesk-react-extensions-host-panel-host"`.
5. Insert that host before the direct child `.extensions_block` when that block is attached to `#rm_extensions_block`.
6. If the extensions block is absent or detached, prepend the host to `#rm_extensions_block`.
7. The host is independent from `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, and `#extensionsMenu`; React must not clear, clone, or replace those protected mount points.

### Build the Extensions Host bridge state

1. Read `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, and `#extensionsMenu`.
2. Read Extras API controls: `#extensions_status`, `#extensions_url`, `#extensions_api_key`, `#extensions_connect`, and `#extensions_autoconnect`.
3. Read the local deferred loader placeholder `#extensions_startup_loading`.
4. Mark protected mount-point booleans and `extrasApiControlsPresent`.
5. Read notify update checkbox state, Extras URL value, whether an Extras API key is set, autoconnect state, and visible Extras status text.
6. Normalize protected mount-point statuses into a list so the React host can display readiness without cloning protected DOM IDs.
7. Merge optional state-change details such as `deferredState`.
8. `public/scripts/extensions.js` dispatches `emberdesk:extensions-host-state-change` when deferred extension loader state changes; `public/script.js` listens and remounts or updates the Extensions Host state.

### Dispatch Extensions Host bridge actions

1. `toggleNotifyUpdates` clicks `#extensions_notify_updates`.
2. `openManageExtensions` clicks `#extensions_details`.
3. `openInstallExtension` clicks `#third_party_extension_button`.
4. `updateExtrasApiUrl` sets `#extensions_url` and triggers the legacy `input` event.
5. `updateExtrasApiKey` sets `#extensions_api_key` and triggers the legacy `input` event.
6. `connectExtrasApi` clicks `#extensions_connect`.
7. `toggleAutoconnect` clicks `#extensions_autoconnect`.
8. Text-field updates do not force an immediate React remount, so a user can type into the React Extras fields without the draft being cleared. Other actions refresh the React host state after dispatch.
9. Protected extension mount points and third-party extension protocol behavior stay legacy-owned.

### Load and mount the shared workspace panel scaffold

1. Read the feature payload from the explicit `features` argument or from `window.__emberDeskWorkspaceFeatures`.
2. If the requested `panelKind` is disabled, return `false`.
3. If the requested container is missing, return `false`.
4. Load `/react/login/assets/workspace-panels.js` through one cached dynamic import promise.
5. If the dynamic import fails, clear the cached promise, report the error through the bridge callback, and return `false`.
6. If the import succeeds, call `workspacePanelBundle.mountWorkspacePanel(panelKind, panelContainer, { state, bridge })` and return `true`.
7. Current production code calls this helper for World Info after the legacy World Info panel initializes and rehydrates; the mounted React content is a host/action island that delegates World Info behavior to the legacy action chain.
8. Current production code calls this helper for Background Library after `initBackgrounds()`, on background drawer click, and after `emberdesk:background-library-state-change`; the mounted React content is a host/action island that delegates background behavior to existing controls.
9. Current production code calls this helper for Extensions Host after `initExtensions()`, on extension drawer click, and after `emberdesk:extensions-host-state-change`; the mounted React content is a host/action island that delegates extension host controls to existing extension actions while preserving protected mount points.

## Key Rules

- The feature payload is a bootstrap contract from the server to the legacy browser shell; it is not a product-facing settings surface.
- The delivered character-library island may use this payload in the current 2026-06-19 code. The World Info flag may mount an independent React host/action island inside the legacy World Info editor panel, but World Info activation, import result semantics, regex placement, prompt activation, and world-book deletion remain legacy-owned.
- The Background Library flag may mount an independent React host/action island inside the legacy Backgrounds panel, but upload/delete/rename file operations, folder assignment, background selection effects, lock behavior, thumbnail generation, and slash-command behavior remain legacy-owned.
- The Extensions Host flag may mount an independent React host/action island inside the legacy Extensions drawer, but extension discovery, manifest loading, script/style injection, Tavern Helper, regex extension, wand menu templates, install/update/delete protocols, and `@sillytavern/*` aliases remain legacy-owned.
- Inline payload escaping is required because config-derived values are embedded in an HTML response.
- Bootstrap injection is idempotent so repeated middleware or test passes do not duplicate the script.
- Disabled World Info, Background Library, and Extensions Host flags must return before host creation so a flag-off workspace has no empty migration host added to those legacy panels.
- The bridge helper is fail-closed: disabled flags, missing containers, and missing bundles all return `false` and leave the legacy panel path available.
- The shared workspace-panel bundle renders panel-specific rows and React-owned controls under a TanStack Query provider for World Info, Background Library, and Extensions Host. TanStack Form + Zod owns the React-visible field/control state; legacy-owned controls remain outside these schemas by design.

## Output Schema

```json
{
  "workspaceReactFeatures": {
    "reactPanels": {
      "characterLibrary": false,
      "worldInfo": false,
      "backgroundLibrary": false,
      "extensionsHost": false
    }
  },
  "workspaceReactFeaturesHtml": "<html><head><script>window.__emberDeskWorkspaceFeatures = {...};</script></head><body></body></html>",
  "worldInfoReactHost": {
    "disabledFlag": null,
    "missingEditorPanel": null,
    "createdBeforeWorldPopup": "emberdesk-react-world-info-panel-host"
  },
  "worldInfoBridgeState": {
    "globalSelectorPresent": true,
    "editorSelectorPresent": true,
    "selectorsSeparated": true,
    "importMenuPresent": true,
    "importBusy": false,
    "dropTargetPresent": true,
    "worldNames": [{"value": "0", "label": "World A", "selected": true}],
    "selectedWorldName": "World A",
    "selectedWorldIndex": "0",
    "entryCount": 1,
    "entrySummaries": [{"uid": "42", "title": "Entry 42", "disabled": false}],
    "searchQuery": "castle",
    "sortValue": "custom",
    "sortOptions": [{"value": "custom", "label": "Custom", "hidden": false}],
    "canCreateEntry": true,
    "exportMenuPresent": true,
    "createWorldMenuPresent": true,
    "refreshMenuPresent": true
  },
  "backgroundLibraryReactHost": {
    "disabledFlag": null,
    "missingBackgroundPanel": null,
    "createdBeforeTabs": "emberdesk-react-background-library-panel-host"
  },
  "backgroundLibraryBridgeState": {
    "status": "success",
    "systemContainerPresent": true,
    "chatContainerPresent": true,
    "systemItemCount": 2,
    "chatItemCount": 1,
    "refreshQueued": false,
    "systemBackgrounds": [{"id": "system-a.png", "title": "System A", "selected": true, "locked": false}],
    "chatBackgrounds": [{"id": "chat-a.png", "title": "Chat A", "selected": false, "locked": true}],
    "filterQuery": "forest",
    "sortValue": "az",
    "folderViewActive": false,
    "lockedCount": 1,
    "selectedCount": 1
  },
  "extensionsHostReactHost": {
    "disabledFlag": null,
    "missingExtensionsPanel": null,
    "createdBeforeExtensionsBlock": "emberdesk-react-extensions-host-panel-host"
  },
  "extensionsHostBridgeState": {
    "extensionsSettingsPresent": true,
    "extensionsSettings2Present": true,
    "regexContainerPresent": true,
    "extensionsMenuButtonPresent": true,
    "extensionsMenuPresent": true,
    "extrasApiControlsPresent": true,
    "notifyUpdatesEnabled": true,
    "extrasApiUrl": "http://localhost:5100",
    "extrasApiKeySet": true,
    "autoconnectEnabled": false,
    "extrasStatusText": "Connected",
    "mountPointStatuses": [
      {"id": "extensions_settings", "label": "Settings column", "ready": true}
    ],
    "deferredState": "loading",
    "deferredPlaceholderPresent": true
  },
  "workspacePanelBridgeResult": {
    "disabled": false,
    "missingContainer": false,
    "importFailure": false,
    "mounted": true,
    "stateForwarded": true,
    "bridgeForwarded": true
  }
}
```

## Sandbox Verification

Run:

```powershell
uv run python .docs/logic-description/react_workspace_panel_flags_sandbox_proof.py
```

The proof script embeds fake feature inputs, HTML, DOM host placement, bridge-state discovery, bridge action dispatch, and dynamic-import outcomes. It verifies default disabled flags, independent panel enablement, escaped bootstrap payloads, insertion before `</head>`, prepend fallback when no head tag exists, idempotent no-op behavior when the bootstrap script is already present, flag-off wrapper paths that do not create World Info / Background Library / Extensions Host hosts, World Info host reuse and placement before `#world_popup`, World Info bridge-state and action dispatch, Background Library host reuse and placement before `#bg_tabs`, Background Library bridge-state and action dispatch, Extensions Host host reuse and placement before `.extensions_block`, Extensions Host bridge-state and action dispatch, fail-closed bridge results, dynamic import cache reset after failure, and successful mount dispatch with forwarded state and bridge.

## Boundaries And Failure Modes

- If all flags are false, the legacy workspace should continue to render its legacy panels and should not receive empty World Info, Background Library, or Extensions Host migration hosts.
- If a future panel flag is true but its browser bridge or bundle fails to load, that panel must fall back to the legacy surface instead of making the workspace unusable.
- If the HTML has no closing head tag, prepending the bootstrap script is acceptable because the script only writes a global feature payload.
- This flow documents the shared bridge fallback rule plus the current World Info, Background Library, and Extensions Host host/action islands, but it does not validate the semantic correctness of legacy-owned prompt scanning, background file operations, or third-party extension protocols. Those remain covered by their focused legacy and compatibility tests.
