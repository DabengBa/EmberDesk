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
- Record the current split between the delivered workspace feature payload, the dedicated Character Library bundle, and the shared workspace-panel bundle that now also mounts the guarded main-chat message-list island.
- Record that World Info, Background Library, and Extensions Host have guarded independent React hosts. These hosts own visible React controls and bridge actions while preserving compatibility-facade owners for prompt/regex/background file/extension protocol work.

Non-goals:

- Document detailed React visual layout inside any individual workspace panel.
- Describe World Info scanning, Backgrounds upload/delete/selection, or Extensions API behavior.
- Replace focused Jest tests for workspace feature flags and panel helpers.

## Input Discovery And Parsing Rules

Inputs:

- `features.react.panels.characterLibrary`: controls the delivered guarded character-library panel island.
- `features.react.panels.mainChatMessageList`: controls the guarded main-chat message-list island mounted through the shared workspace-panel bundle.
- `features.react.panels.worldInfo`: controls the current World Info independent React readiness host.
- `features.react.panels.backgroundLibrary`: controls the current Background Library independent React status host.
- `features.react.panels.extensionsHost`: controls the current Extensions Host independent React host.
- `workspaceIndexHtml`: the legacy workspace HTML string read before response send.
- `panelKind`: the requested shared-bundle panel kind, currently one of `mainChatMessageList`, `worldInfo`, `backgroundLibrary`, or `extensionsHost`.
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

Missing or non-boolean panel flags resolve to `false`. The default config keeps all workspace panel flags off except where a local config or environment override explicitly enables one. The browser mount wrappers check the matching flag before creating an independent host or reading bridge state, so a disabled flag does not leave an empty React host in the legacy panel. `characterLibrary` is part of the same bootstrap payload but mounts through its dedicated bundle rather than through the shared `workspace-panels.js` helper.

## Outputs

The processing outputs are:

- `workspaceReactFeatures`: the object exposed to the browser as `window.__emberDeskWorkspaceFeatures`.
- `workspaceReactFeaturesScript`: the escaped inline bootstrap script.
- `workspaceReactFeaturesHtml`: the workspace HTML with the bootstrap script inserted once.
- `mainChatMessageListReactHost`: an idempotent host inside `#chat` for the guarded React main-chat island, or cleanup/fallback when the main-chat flag is disabled.
- `mainChatMessageListBridgeState`: a payload passed to the shared workspace-panel bundle for safe visible row, composer, slash, streaming, transport, and reading-position restoration state.
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
2. Return one `reactPanels` object containing `characterLibrary`, `mainChatMessageList`, `worldInfo`, `backgroundLibrary`, and `extensionsHost`.
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
2. If `reactPanels.mainChatMessageList` is false, clean up the guarded main-chat React host and return `false` before reading its bridge state.
3. If `reactPanels.worldInfo` is false, return `false` before calling `ensureWorldInfoReactHost()` or building World Info bridge state.
4. If `reactPanels.backgroundLibrary` is false, return `false` before calling `ensureBackgroundLibraryReactHost()` or building Background Library bridge state.
5. If `reactPanels.extensionsHost` is false, return `false` before calling `ensureExtensionsHostReactHost()` or building Extensions Host bridge state.
6. Continue to host creation only for the panel whose flag is enabled.

### Create the guarded main-chat React host

1. This stage is reached only after the `mainChatMessageList` flag guard passes.
2. Reuse the existing dedicated React host inside `#chat` when it is already mounted.
3. Otherwise create the host through the main-chat bridge helper without replacing the existing `#chat > .mes[mesid]` direct-child structure or `#show_more_messages` ordering.
4. The host is for guarded React ownership markers, visible rows/actions/composer/slash UI, and supported direct-chat transport slices. It must fail closed to the existing legacy chat owner whenever the bridge payload is unsafe, the bundle cannot mount, or the request/row is excluded.

### Build the main-chat bridge state

1. Read the current visible main-chat bridge payload from the legacy shell, including safe row snapshots, visible action snapshots, composer state, slash state, transport state, reading-position snapshots, and the current session chat identifier.
2. Keep full slash-command text, unsafe row structures, legacy formatter DOM internals, and excluded transport request shapes out of the bridge payload.
3. Preserve per-chat scroll snapshot state separately so React can attempt same-session reading-position restore without becoming the owner of the long-chat load-more algorithm itself.
4. If the bridge payload is absent or unsafe, the later mount step must fail closed back to the legacy chat owner.

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

1. `selectWorld` routes through `selectWorldInfoEditorIndex()` in `public/scripts/world-info.js`.
2. `applySearchQuery` routes through `applyWorldInfoSearchQuery()` and `applySortOption` routes through `applyWorldInfoSortOption()`.
3. `createEntry`, `createWorld`, `importWorld`, `exportWorld`, `renameWorld`, `duplicateWorld`, `deleteWorld`, and `refreshWorld` route through explicit World Info helper functions rather than directly triggering legacy DOM controls from `public/script.js`.
4. `openEntry` routes through `openWorldInfoEntryByUid()`; the World Info module may still use the existing card affordance internally after it has resolved the requested entry.
5. After action dispatch, the World Info React host refreshes bridge state; the underlying semantics remain owned by `public/scripts/world-info.js` as a compatibility facade rather than by a raw DOM-click bridge.

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
3. Merge optional state-change details such as `isLoading`; `error` and `refreshQueued` are accepted bridge inputs for future callers, and current production background events now cover catalog loading plus visible gallery, folder, filter, and selection-state changes.
4. Pass the merged values through the background panel state helper so loading, empty, success, and any explicitly supplied error state stay aligned with the legacy loading controller.
5. Add container presence booleans and global/chat item counts to the state passed to the React workspace-panel bundle.
6. Normalize visible global/chat background rows from `.bg_example`, including `bgfile`, title, URL, custom/animated flags, selected state, and locked state.
7. Read `#bg-filter`, `#bg-sort`, folder view, locked count, and selected count for the React host.
8. `public/scripts/backgrounds.js` dispatches `emberdesk:background-library-state-change` when catalog loading or visible background-library state changes; `public/script.js` listens and remounts or updates the Background Library host state.

### Dispatch Background Library bridge actions

1. `applyBackgroundFilter` routes through `applyBackgroundLibraryFilter()` in `public/scripts/backgrounds.js`, which updates the legacy field value and reuses the existing filtering path.
2. `applyBackgroundSort` routes through `applyBackgroundLibrarySort()` in `public/scripts/backgrounds.js`, which reuses the existing sort, gallery refresh, and selection-highlight path.
3. `uploadBackground` clicks `#add_bg_button`.
4. `selectBackground` finds the requested visible `.bg_example` in the global or chat gallery, then routes through `applyBackgroundSelection(..., { respectGroupSelectionMode: false })` so React selection is not hijacked by legacy folder-group selection mode.
5. `lockBackground`, `unlockBackground`, and `autoBackground` route through explicit `public/scripts/backgrounds.js` helpers instead of clicking the existing controls; slash-command behavior still stays owned by that module and by the protected slash-command exports.
6. `refreshBackgrounds` calls the existing `getBackgrounds({ force: true })` refresh path, and `public/script.js` remounts the React host again after the action settles.
7. The React host owns the visible action entry points; background file operations, thumbnail generation, folder persistence, and slash-command parser/export surfaces stay on their existing compatibility owners.

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
8. `public/scripts/extensions.js` dispatches `emberdesk:extensions-host-state-change` when deferred extension loader state or visible host control state changes; `public/script.js` listens and remounts or updates the Extensions Host state.

### Dispatch Extensions Host bridge actions

1. `toggleNotifyUpdates` routes through `toggleExtensionsHostNotifyUpdates()` in `public/scripts/extensions.js`.
2. `openManageExtensions` routes through `openExtensionsHostManager()` in `public/scripts/extensions.js`, which reuses deferred-loader readiness and the existing details flow.
3. `openInstallExtension` routes through `openExtensionsHostInstaller()` in `public/scripts/extensions.js`, which reuses the established install popup and API flow.
4. `updateExtrasApiUrl` routes through `updateExtensionsHostApiUrl()` in `public/scripts/extensions.js`; text-field updates still avoid a forced React remount from the bridge itself so the visible draft is not cleared.
5. `updateExtrasApiKey` routes through `updateExtensionsHostApiKey()` in `public/scripts/extensions.js` with the same draft-preservation rule.
6. `connectExtrasApi` routes through `connectExtensionsHostApi()` in `public/scripts/extensions.js`.
7. `toggleAutoconnect` routes through `setExtensionsHostAutoconnectEnabled()` in `public/scripts/extensions.js`.
8. `public/script.js` remounts the React host after action settlement for non-draft actions, while `public/scripts/extensions.js` remains the compatibility facade for deferred loader, install/manage orchestration, Extras connect/autoconnect, and host-state reporting.
9. Protected extension mount points and third-party extension protocol behavior stay on their existing compatibility owners.

### Load and mount the shared workspace panel scaffold

1. Read the feature payload from the explicit `features` argument or from `window.__emberDeskWorkspaceFeatures`.
2. If the requested `panelKind` is disabled, return `false`.
3. If the requested container is missing, return `false`.
4. Load `/react/login/assets/workspace-panels.js` through one cached dynamic import promise.
5. If the dynamic import fails, clear the cached promise, report the error through the bridge callback, and return `false`.
6. If the import succeeds, call `workspacePanelBundle.mountWorkspacePanel(panelKind, panelContainer, { state, bridge })` and return `true`.
7. Current production code calls this helper for the guarded main-chat island when `features.react.panels.mainChatMessageList` is enabled; the mounted React content may own safe visible rows/actions/composer/slash UI and supported direct-chat transport slices, while excluded transport and renderer/windowing ownership still fail closed to legacy.
8. Current production code calls this helper for World Info after the legacy World Info panel initializes and rehydrates; the mounted React content is a host/action island that delegates World Info behavior to the legacy action chain.
9. Current production code calls this helper for Background Library after `initBackgrounds()`, on background drawer click, after `emberdesk:background-library-state-change`, and after each React-dispatched action settles; the mounted React content is the normal visible owner path while `public/scripts/backgrounds.js` stays the compatibility facade for the underlying background behavior.
10. Current production code calls this helper for Extensions Host after `initExtensions()`, on extension drawer click, after `emberdesk:extensions-host-state-change`, and after each settled non-draft React-dispatched action; the mounted React content is the normal visible owner path while `public/scripts/extensions.js` preserves protected mount points and compatibility-sensitive host behavior.

## Key Rules

- The feature payload is a bootstrap contract from the server to the legacy browser shell; it is not a product-facing settings surface.
- The delivered workspace bootstrap payload now covers both dedicated-bundle and shared-bundle React slices. `characterLibrary` uses its own character-library bundle; `mainChatMessageList`, `worldInfo`, `backgroundLibrary`, and `extensionsHost` use the shared `workspace-panels.js` bundle.
- The `mainChatMessageList` flag may mount a guarded React island inside the existing `#chat` surface, but excluded non-OpenAI/group/dry-run/nested/quiet/background transport paths, legacy formatter/rich-body HTML, and long-chat load-more ownership remain legacy-owned.
- The World Info flag may mount an independent React host/action island inside the legacy World Info editor panel, but World Info activation, import result semantics, regex placement, prompt activation, and world-book deletion still remain owned by `public/scripts/world-info.js`; React now reaches that owner through explicit helper functions instead of directly poking the legacy DOM controls.
- The Background Library flag may mount an independent React host inside the legacy Backgrounds panel, and the visible React filter/gallery/action path is now the normal owner for that surface. Underlying selection, lock, folder, thumbnail, and slash-compatible behavior still executes through the `public/scripts/backgrounds.js` compatibility facade; file APIs and protected slash-command exports are not reimplemented in React.
- The Extensions Host flag may mount an independent React host inside the legacy Extensions drawer, and the visible React notify/manage/install/Extras path is now the normal owner for that surface. Protected mount points remain frozen compatibility nodes, while extension discovery, manifest loading, script/style injection, Tavern Helper, regex extension, wand menu templates, install/update/delete protocols, and `@sillytavern/*` aliases continue to execute through `public/scripts/extensions.js` and the existing protected surfaces rather than being reimplemented in React.
- Inline payload escaping is required because config-derived values are embedded in an HTML response.
- Bootstrap injection is idempotent so repeated middleware or test passes do not duplicate the script.
- Disabled main-chat, World Info, Background Library, and Extensions Host flags must return before host creation so a flag-off workspace has no empty migration host added to those legacy surfaces.
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

```bash
uv run python .docs/logic-description/react_workspace_panel_flags_sandbox_proof.py
```

The proof script embeds fake feature inputs, HTML, DOM host placement, bridge-state discovery, bridge action dispatch, and dynamic-import outcomes. It verifies default disabled flags, independent panel enablement, escaped bootstrap payloads, insertion before `</head>`, prepend fallback when no head tag exists, idempotent no-op behavior when the bootstrap script is already present, flag-off wrapper paths that do not create World Info / Background Library / Extensions Host hosts, World Info host reuse and placement before `#world_popup`, World Info bridge-state and action dispatch, Background Library host reuse and placement before `#bg_tabs`, Background Library bridge-state and action dispatch, Extensions Host host reuse and placement before `.extensions_block`, Extensions Host bridge-state and action dispatch, fail-closed bridge results, dynamic import cache reset after failure, and successful mount dispatch with forwarded state and bridge.

## Boundaries And Failure Modes

- If all flags are false, the legacy workspace should continue to render its legacy panels and should not receive empty World Info, Background Library, or Extensions Host migration hosts.
- If a future panel flag is true but its browser bridge or bundle fails to load, that panel must fall back to the legacy surface instead of making the workspace unusable.
- If the HTML has no closing head tag, prepending the bootstrap script is acceptable because the script only writes a global feature payload.
- This flow documents the shared bridge fallback rule plus the current World Info, Background Library, and Extensions Host host/action islands, but it does not validate the semantic correctness of legacy-owned prompt scanning, background file operations, or third-party extension protocols. Those remain covered by their focused legacy and compatibility tests.
