"""Sandbox proof for react_workspace_panel_flags_processing_flow.md.

Run with:
    uv run python .docs/logic-description/react_workspace_panel_flags_sandbox_proof.py
"""

import json


WORKSPACE_REACT_FEATURES_GLOBAL = "__emberDeskWorkspaceFeatures"
PANEL_NAMES = (
    "characterLibrary",
    "mainChatMessageList",
    "worldInfo",
    "backgroundLibrary",
    "extensionsHost",
)
REACT_WORKSPACE_PANELS_ASSET_PATH = "/react/login/assets/workspace-panels.js"
WORLD_INFO_REACT_HOST_ID = "emberdesk-react-world-info-panel-host"
BACKGROUND_LIBRARY_REACT_HOST_ID = "emberdesk-react-background-library-panel-host"
EXTENSIONS_HOST_REACT_HOST_ID = "emberdesk-react-extensions-host-panel-host"
WORKSPACE_SHELL_DRAWER_IDS = {
    "characterLibrary": "right-nav-panel",
    "worldInfo": "WorldInfo",
    "backgroundLibrary": "Backgrounds",
    "extensionsHost": "rm_extensions_block",
}
WORKSPACE_PANEL_VISIBLE_STATUS_LABELS = {
    "idle": "idle",
    "loading": "opening",
    "empty": "needs setup",
    "success": "ready",
    "error": "needs attention",
    "disabled": "using legacy panel",
}


def build_workspace_react_features(config):
    react_config = config.get("features", {}).get("react", {})
    panels = {}
    configured_panels = react_config.get("panels", {})
    for panel_name in PANEL_NAMES:
        panels[panel_name] = configured_panels.get(panel_name) is True

    pages = {
        "settings": react_config.get("pages", {}).get("settings") is True,
    }
    takeover = react_config.get("shell", {}).get("takeover") is True
    node_env = config.get("nodeEnv")
    strict = takeover and (
        config.get("ci") == "true"
        or node_env == "development"
        or node_env == "test"
    )
    return {
        "reactPages": pages,
        "reactPanels": panels,
        "reactShell": {
            "strict": strict,
            "takeover": takeover,
        },
    }


def serialize_workspace_react_features(features):
    return (
        json.dumps(features, separators=(",", ":"))
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def build_workspace_react_features_script(features):
    serialized = serialize_workspace_react_features(features)
    return f"<script>window.{WORKSPACE_REACT_FEATURES_GLOBAL} = {serialized};</script>"


def inject_workspace_react_features(html, features):
    if not isinstance(html, str) or len(html) == 0:
        return html

    if f"window.{WORKSPACE_REACT_FEATURES_GLOBAL}" in html:
        return html

    script = build_workspace_react_features_script(features)
    lower_html = html.lower()
    head_index = lower_html.find("</head>")
    if head_index >= 0:
        return f"{html[:head_index]}{script}\n{html[head_index:]}"

    return f"{script}\n{html}"


def is_react_workspace_panel_enabled(kind, features):
    return bool(features.get("reactPanels", {}).get(kind))


def get_workspace_shell_panel_dock_state(document, kind):
    drawer_id = WORKSPACE_SHELL_DRAWER_IDS.get(kind)
    drawer = document.get(drawer_id) if drawer_id else None
    pinned = drawer is not None and "pinnedOpen" in drawer.class_name.split()
    return {
        "locked": pinned,
        "pinned": pinned,
    }


def create_workspace_shell_panel_result(document, kind, result_or_mounted):
    dock_state = get_workspace_shell_panel_dock_state(document, kind)
    if isinstance(result_or_mounted, dict):
        return {
            **result_or_mounted,
            "locked": dock_state["locked"],
            "pinned": dock_state["pinned"],
        }

    if result_or_mounted:
        return {
            "kind": kind,
            "locked": dock_state["locked"],
            "mounted": True,
            "pinned": dock_state["pinned"],
            "status": "mounted",
        }

    return {
        "kind": kind,
        "locked": dock_state["locked"],
        "mounted": False,
        "pinned": dock_state["pinned"],
        "reason": "feature-disabled",
        "status": "fallback",
    }


def normalize_workspace_panel_dock_status(result):
    if result.get("mounted") is True or result.get("status") == "mounted":
        return "success"
    if result.get("status") == "disabled":
        return "disabled"
    if result.get("status") == "fallback":
        return "disabled" if result.get("reason") == "feature-disabled" else "error"
    if result.get("status") in {"loading", "empty", "success", "error"}:
        return result["status"]
    return "success"


def get_workspace_panel_visible_status_label(status):
    return WORKSPACE_PANEL_VISIBLE_STATUS_LABELS.get(status, "ready")


def create_default_workspace_panel_dock_snapshot():
    return {
        "activePanelKind": None,
        "activePanelStatus": "idle",
        "fallbackReason": None,
        "lockedPanelKinds": [],
        "openPanelKinds": [],
        "pinnedPanelKinds": [],
    }


def reconcile_panel_kind_presence(panel_kinds, kind, should_remember):
    next_panel_kinds = [panel_kind for panel_kind in panel_kinds if panel_kind != kind]
    return next_panel_kinds + [kind] if should_remember else next_panel_kinds


def remember_panel_kind(panel_kinds, kind):
    return panel_kinds if kind in panel_kinds else panel_kinds + [kind]


def record_workspace_panel_dock_intent(snapshot, kind, locked=None, pinned=None):
    return {
        "activePanelKind": kind,
        "activePanelStatus": "loading",
        "fallbackReason": None,
        "lockedPanelKinds": reconcile_panel_kind_presence(
            snapshot["lockedPanelKinds"],
            kind,
            kind in snapshot["lockedPanelKinds"] if locked is None else locked,
        ),
        "openPanelKinds": remember_panel_kind(snapshot["openPanelKinds"], kind),
        "pinnedPanelKinds": reconcile_panel_kind_presence(
            snapshot["pinnedPanelKinds"],
            kind,
            kind in snapshot["pinnedPanelKinds"] if pinned is None else pinned,
        ),
    }


def record_workspace_panel_dock_result(snapshot, kind, result):
    return {
        "activePanelKind": kind,
        "activePanelStatus": normalize_workspace_panel_dock_status(result),
        "fallbackReason": result.get("fallbackReason"),
        "lockedPanelKinds": reconcile_panel_kind_presence(
            snapshot["lockedPanelKinds"],
            kind,
            kind in snapshot["lockedPanelKinds"] if result.get("locked") is None else result.get("locked"),
        ),
        "openPanelKinds": remember_panel_kind(snapshot["openPanelKinds"], kind),
        "pinnedPanelKinds": reconcile_panel_kind_presence(
            snapshot["pinnedPanelKinds"],
            kind,
            kind in snapshot["pinnedPanelKinds"] if result.get("pinned") is None else result.get("pinned"),
        ),
    }


class FakeElement:
    def __init__(self, element_id, value="", text=""):
        self.id = element_id
        self.class_name = ""
        self.attributes = {}
        self.disabled = False
        self.value = value
        self.text = text
        self.checked = False
        self.options = []
        self.clicks = 0
        self.parent_element = None
        self.children = []

    def prepend(self, child):
        if child in self.children:
            self.children.remove(child)
        child.parent_element = self
        self.children.insert(0, child)

    def insert_before(self, child, reference_child):
        if reference_child not in self.children:
            raise AssertionError("reference child is not attached")
        if child in self.children:
            self.children.remove(child)
        child.parent_element = self
        self.children.insert(self.children.index(reference_child), child)

    def append(self, child):
        if child in self.children:
            self.children.remove(child)
        child.parent_element = self
        self.children.append(child)

    def click(self):
        self.clicks += 1

    def get_attribute(self, name):
        return self.attributes.get(name)

    def text_content(self):
        return self.text

    def query_selector_all(self, selector):
        if selector != ".bg_example":
            return []

        matches = []

        def visit(node):
            if "bg_example" in node.class_name.split():
                matches.append(node)
            for child in node.children:
                visit(child)

        for child in self.children:
            visit(child)
        return matches


class FakeOption:
    def __init__(self, value, label, selected=False, hidden=False):
        self.value = value
        self.label = label
        self.selected = selected
        self.hidden = hidden


def get_element_value(element):
    return element.value if element is not None else ""


def click_element(document, element_id):
    element = document.get(element_id)
    if element is not None:
        element.click()


def set_element_value(document, element_id, value):
    element = document.get(element_id)
    if element is not None:
        element.value = value
        document.setdefault("__events", []).append((element_id, "input", value))


def ensure_world_info_react_host(document):
    editor_panel = document.get("wiEditorPanel")
    if editor_panel is None:
        return None

    existing_host = document.get(WORLD_INFO_REACT_HOST_ID)
    if existing_host is not None:
        return existing_host

    host = FakeElement(WORLD_INFO_REACT_HOST_ID)
    host.class_name = "emberdesk-react-world-info-panel-host"
    document[WORLD_INFO_REACT_HOST_ID] = host

    world_popup = document.get("world_popup")
    if world_popup is not None and world_popup.parent_element is editor_panel:
        editor_panel.insert_before(host, world_popup)
    else:
        editor_panel.prepend(host)

    return host


def get_world_info_react_bridge_state(document):
    global_selector = document.get("world_info")
    editor_selector = document.get("world_editor_select")
    import_menu_item = document.get("world_import_menu_item")
    import_file_input = document.get("world_import_file")
    world_popup = document.get("world_popup")
    world_info_search = document.get("world_info_search")
    world_info_sort_order = document.get("world_info_sort_order")
    create_entry_button = document.get("world_create_button")
    entry_summaries = document.get("world_entries", [])
    selected_option = next((option for option in getattr(editor_selector, "options", []) if option.selected), None)

    return {
        "globalSelectorPresent": global_selector is not None,
        "editorSelectorPresent": editor_selector is not None,
        "selectorsSeparated": global_selector is not None and editor_selector is not None and global_selector is not editor_selector,
        "importMenuPresent": import_menu_item is not None,
        "importBusy": (
            (import_menu_item is not None and import_menu_item.get_attribute("aria-disabled") == "true")
            or (import_file_input is not None and import_file_input.disabled is True)
        ),
        "dropTargetPresent": world_popup is not None,
        "worldNames": [
            {"value": option.value, "label": option.label, "selected": option.selected}
            for option in getattr(editor_selector, "options", [])
            if option.value != ""
        ],
        "selectedWorldName": selected_option.label if selected_option is not None and selected_option.value != "" else "",
        "selectedWorldIndex": get_element_value(editor_selector),
        "entryCount": len(entry_summaries),
        "entrySummaries": entry_summaries,
        "searchQuery": get_element_value(world_info_search),
        "sortValue": get_element_value(world_info_sort_order),
        "sortOptions": [
            {"value": option.value, "label": option.label, "hidden": option.hidden}
            for option in getattr(world_info_sort_order, "options", [])
        ],
        "canCreateEntry": create_entry_button is None or create_entry_button.get_attribute("aria-disabled") != "true",
        "exportMenuPresent": document.get("world_export_menu_item") is not None,
        "createWorldMenuPresent": document.get("world_create_world") is not None,
        "refreshMenuPresent": document.get("world_refresh") is not None,
    }


def dispatch_world_info_action(document, action, payload=None):
    payload = payload or {}
    document.setdefault("__actions", []).append(("worldInfo", action, payload))
    if action == "selectWorld":
        set_element_value(document, "world_editor_select", str(payload.get("worldIndex", "")))
        document.setdefault("__events", []).append(("world_editor_select", "change", payload.get("worldIndex", "")))
    elif action == "applySearchQuery":
        set_element_value(document, "world_info_search", str(payload.get("searchQuery", "")))
    elif action == "applySortOption":
        set_element_value(document, "world_info_sort_order", str(payload.get("sortValue", "")))
        document.setdefault("__events", []).append(("world_info_sort_order", "change", payload.get("sortValue", "")))
    elif action == "createEntry":
        click_element(document, "world_create_button")
    elif action == "importWorld":
        click_element(document, "world_import_menu_item")
    elif action == "exportWorld":
        click_element(document, "world_export_menu_item")
    elif action == "refreshWorld":
        click_element(document, "world_refresh")
    elif action == "openEntry":
        document["__opened_entry"] = str(payload.get("uid", ""))


def ensure_background_library_react_host(document):
    background_panel = document.get("Backgrounds")
    if background_panel is None:
        return None

    existing_host = document.get(BACKGROUND_LIBRARY_REACT_HOST_ID)
    if existing_host is not None:
        return existing_host

    host = FakeElement(BACKGROUND_LIBRARY_REACT_HOST_ID)
    host.class_name = "emberdesk-react-background-library-panel-host"
    document[BACKGROUND_LIBRARY_REACT_HOST_ID] = host

    background_tabs = document.get("bg_tabs")
    if background_tabs is not None and background_tabs.parent_element is background_panel:
        background_panel.insert_before(host, background_tabs)
    else:
        background_panel.prepend(host)

    return host


def get_background_panel_state(is_loading, item_count, error=None):
    show_loading = bool(is_loading)
    show_error = error is not None
    show_empty = not show_loading and not show_error and item_count == 0
    status = (
        "loading"
        if show_loading
        else "error"
        if show_error
        else "empty"
        if show_empty
        else "success"
    )

    return {
        "status": status,
        "showLoading": show_loading,
        "showEmpty": show_empty,
        "showError": show_error,
    }


def get_background_library_react_bridge_state(document, state_overrides=None):
    state_overrides = state_overrides or {}
    system_container = document.get("bg_menu_content")
    chat_container = document.get("bg_custom_content")
    loading_indicator = document.get("bg_startup_loading")
    system_item_count = len(system_container.query_selector_all(".bg_example")) if system_container else 0
    chat_item_count = len(chat_container.query_selector_all(".bg_example")) if chat_container else 0
    panel_state = get_background_panel_state(
        is_loading=bool(state_overrides.get("isLoading")) or loading_indicator is not None,
        item_count=system_item_count + chat_item_count,
        error=state_overrides.get("error"),
    )

    return {
        **panel_state,
        "systemContainerPresent": system_container is not None,
        "chatContainerPresent": chat_container is not None,
        "systemItemCount": system_item_count,
        "chatItemCount": chat_item_count,
        "refreshQueued": bool(state_overrides.get("refreshQueued")),
        "systemBackgrounds": get_background_gallery_items(system_container),
        "chatBackgrounds": get_background_gallery_items(chat_container),
        "filterQuery": get_element_value(document.get("bg-filter")),
        "sortValue": get_element_value(document.get("bg-sort")),
        "folderViewActive": bool(document.get("Backgrounds") and "in-folder-view" in document["Backgrounds"].class_name.split()),
        "lockedCount": count_backgrounds(document, "locked-background"),
        "selectedCount": count_backgrounds(document, "selected-background"),
    }


def get_background_gallery_items(container):
    if container is None:
        return []

    items = []
    for index, element in enumerate(container.query_selector_all(".bg_example")):
        classes = element.class_name.split()
        items.append({
            "id": element.get_attribute("bgfile") or f"{container.id}-{index}",
            "title": element.get_attribute("title") or element.text_content() or f"Background {index + 1}",
            "url": element.get_attribute("data-url") or "",
            "isCustom": element.get_attribute("custom") == "true",
            "animated": element.get_attribute("animated") == "true",
            "selected": "selected-background" in classes,
            "locked": "locked-background" in classes,
        })
    return items


def count_backgrounds(document, class_name):
    count = 0
    for container_id in ("bg_menu_content", "bg_custom_content"):
        container = document.get(container_id)
        if container is None:
            continue
        count += sum(1 for item in container.query_selector_all(".bg_example") if class_name in item.class_name.split())
    return count


def dispatch_background_library_action(document, action, payload=None):
    payload = payload or {}
    document.setdefault("__actions", []).append(("backgroundLibrary", action, payload))
    if action == "applyBackgroundFilter":
        set_element_value(document, "bg-filter", str(payload.get("filterQuery", "")))
    elif action == "applyBackgroundSort":
        set_element_value(document, "bg-sort", str(payload.get("sortValue", "")))
        document.setdefault("__events", []).append(("bg-sort", "change", payload.get("sortValue", "")))
    elif action == "uploadBackground":
        click_element(document, "add_bg_button")
    elif action == "selectBackground":
        document["__selected_background"] = (payload.get("source"), payload.get("id"))
    elif action == "lockBackground":
        document["__lock_requested"] = True
    elif action == "unlockBackground":
        document["__unlock_requested"] = True
    elif action == "autoBackground":
        click_element(document, "auto_background")
    elif action == "refreshBackgrounds":
        document["__background_refresh_forced"] = True


def ensure_extensions_host_react_host(document):
    extensions_panel = document.get("rm_extensions_block")
    if extensions_panel is None:
        return None

    existing_host = document.get(EXTENSIONS_HOST_REACT_HOST_ID)
    if existing_host is not None:
        return existing_host

    host = FakeElement(EXTENSIONS_HOST_REACT_HOST_ID)
    host.class_name = "emberdesk-react-extensions-host-panel-host"
    document[EXTENSIONS_HOST_REACT_HOST_ID] = host

    extensions_block = document.get("extensions_block")
    if extensions_block is not None and extensions_block.parent_element is extensions_panel:
        extensions_panel.insert_before(host, extensions_block)
    else:
        extensions_panel.prepend(host)

    return host


def get_extensions_host_react_bridge_state(document, state_overrides=None):
    state_overrides = state_overrides or {}
    extensions_settings = document.get("extensions_settings")
    extensions_settings2 = document.get("extensions_settings2")
    regex_container = document.get("regex_container")
    extensions_menu_button = document.get("extensionsMenuButton")
    extensions_menu = document.get("extensionsMenu")
    extensions_status = document.get("extensions_status")
    extensions_url = document.get("extensions_url")
    extensions_api_key = document.get("extensions_api_key")
    extensions_connect = document.get("extensions_connect")
    extensions_autoconnect = document.get("extensions_autoconnect")
    extensions_notify_updates = document.get("extensions_notify_updates")
    deferred_placeholder = document.get("extensions_startup_loading")

    return {
        "extensionsSettingsPresent": extensions_settings is not None,
        "extensionsSettings2Present": extensions_settings2 is not None,
        "regexContainerPresent": regex_container is not None,
        "extensionsMenuButtonPresent": extensions_menu_button is not None,
        "extensionsMenuPresent": extensions_menu is not None,
        "extrasApiControlsPresent": all([
            extensions_status,
            extensions_url,
            extensions_api_key,
            extensions_connect,
            extensions_autoconnect,
        ]),
        "manageButtonPresent": document.get("extensions_details") is not None,
        "installButtonPresent": document.get("third_party_extension_button") is not None,
        "notifyUpdatesEnabled": extensions_notify_updates.checked is True if extensions_notify_updates else False,
        "extrasApiUrl": get_element_value(extensions_url),
        "extrasApiKeySet": bool(get_element_value(extensions_api_key)),
        "autoconnectEnabled": extensions_autoconnect.checked is True if extensions_autoconnect else False,
        "extrasStatusText": extensions_status.text_content().strip() if extensions_status else "",
        "mountPointStatuses": get_extensions_host_mount_point_statuses(document),
        "deferredState": state_overrides.get("deferredState", "idle"),
        "deferredPlaceholderPresent": deferred_placeholder is not None,
    }


def get_extensions_host_mount_point_statuses(document):
    return [
        {"id": "extensions_settings", "label": "Settings column", "ready": document.get("extensions_settings") is not None},
        {"id": "extensions_settings2", "label": "Settings column 2", "ready": document.get("extensions_settings2") is not None},
        {"id": "regex_container", "label": "Regex container", "ready": document.get("regex_container") is not None},
        {"id": "extensionsMenuButton", "label": "Wand button", "ready": document.get("extensionsMenuButton") is not None},
        {"id": "extensionsMenu", "label": "Wand menu", "ready": document.get("extensionsMenu") is not None},
    ]


def dispatch_extensions_host_action(document, action, payload=None):
    payload = payload or {}
    document.setdefault("__actions", []).append(("extensionsHost", action, payload))
    if action == "toggleNotifyUpdates":
        click_element(document, "extensions_notify_updates")
        if document.get("extensions_notify_updates"):
            document["extensions_notify_updates"].checked = not document["extensions_notify_updates"].checked
    elif action == "openManageExtensions":
        click_element(document, "extensions_details")
    elif action == "openInstallExtension":
        click_element(document, "third_party_extension_button")
    elif action == "updateExtrasApiUrl":
        set_element_value(document, "extensions_url", str(payload.get("url", "")))
    elif action == "updateExtrasApiKey":
        set_element_value(document, "extensions_api_key", str(payload.get("apiKey", "")))
    elif action == "connectExtrasApi":
        click_element(document, "extensions_connect")
    elif action == "toggleAutoconnect":
        click_element(document, "extensions_autoconnect")
        if document.get("extensions_autoconnect"):
            document["extensions_autoconnect"].checked = not document["extensions_autoconnect"].checked


class FakeWorkspacePanelsLoader:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []
        self.cached_module = None

    def load(self):
        if self.cached_module is not None:
            return self.cached_module

        self.calls.append(REACT_WORKSPACE_PANELS_ASSET_PATH)
        if not self.outcomes:
            raise AssertionError("fake loader has no more outcomes")

        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            self.cached_module = None
            raise outcome

        self.cached_module = outcome
        return outcome


class FakeWorkspacePanelModule:
    def __init__(self):
        self.mounted = []

    def mount_workspace_panel(self, kind, container, options=None):
        self.mounted.append((kind, container, options or {}))


def mount_react_workspace_panel(kind, container, features, loader, on_error, state=None, bridge=None):
    if not is_react_workspace_panel_enabled(kind, features) or container is None:
        return False

    try:
        panel_module = loader.load()
        panel_module.mount_workspace_panel(kind, container, {"state": state, "bridge": bridge})
        return True
    except Exception as error:
        on_error(error, kind)
        return False


def mount_world_info_panel(document, features, loader, on_error):
    if not is_react_workspace_panel_enabled("worldInfo", features):
        return False

    return mount_react_workspace_panel(
        "worldInfo",
        ensure_world_info_react_host(document),
        features,
        loader,
        on_error,
        get_world_info_react_bridge_state(document),
        {"dispatchAction": lambda action, payload=None: dispatch_world_info_action(document, action, payload)},
    )


def mount_background_library_panel(document, features, loader, on_error, state_overrides=None):
    if not is_react_workspace_panel_enabled("backgroundLibrary", features):
        return False

    return mount_react_workspace_panel(
        "backgroundLibrary",
        ensure_background_library_react_host(document),
        features,
        loader,
        on_error,
        get_background_library_react_bridge_state(document, state_overrides),
        {"dispatchAction": lambda action, payload=None: dispatch_background_library_action(document, action, payload)},
    )


def mount_extensions_host_panel(document, features, loader, on_error, state_overrides=None):
    if not is_react_workspace_panel_enabled("extensionsHost", features):
        return False

    return mount_react_workspace_panel(
        "extensionsHost",
        ensure_extensions_host_react_host(document),
        features,
        loader,
        on_error,
        get_extensions_host_react_bridge_state(document, state_overrides),
        {"dispatchAction": lambda action, payload=None: dispatch_extensions_host_action(document, action, payload)},
    )


def main():
    default_features = build_workspace_react_features({})
    assert default_features == {
        "reactPages": {
            "settings": False,
        },
        "reactPanels": {
            "characterLibrary": False,
            "mainChatMessageList": False,
            "worldInfo": False,
            "backgroundLibrary": False,
            "extensionsHost": False,
        },
        "reactShell": {
            "strict": False,
            "takeover": False,
        },
    }

    mixed_features = build_workspace_react_features({
        "features": {
            "react": {
                "pages": {
                    "settings": True,
                },
                "panels": {
                    "characterLibrary": True,
                    "mainChatMessageList": True,
                    "worldInfo": True,
                    "backgroundLibrary": False,
                    "extensionsHost": True,
                },
                "shell": {
                    "takeover": True,
                },
            }
        },
        "nodeEnv": "development",
    })
    assert mixed_features["reactPages"]["settings"] is True
    assert mixed_features["reactPanels"]["characterLibrary"] is True
    assert mixed_features["reactPanels"]["mainChatMessageList"] is True
    assert mixed_features["reactPanels"]["worldInfo"] is True
    assert mixed_features["reactPanels"]["backgroundLibrary"] is False
    assert mixed_features["reactPanels"]["extensionsHost"] is True
    assert mixed_features["reactShell"] == {"strict": True, "takeover": True}

    shell_takeover_without_node_env = build_workspace_react_features({
        "features": {
            "react": {
                "shell": {"takeover": True},
            },
        },
    })
    assert shell_takeover_without_node_env["reactShell"] == {"strict": False, "takeover": True}

    shell_takeover_in_ci = build_workspace_react_features({
        "features": {
            "react": {
                "shell": {"takeover": True},
            },
        },
        "ci": "true",
    })
    assert shell_takeover_in_ci["reactShell"] == {"strict": True, "takeover": True}

    unsafe_features = {
        "reactPages": {"settings": True},
        "reactPanels": {
            "characterLibrary": True,
            "mainChatMessageList": True,
            "worldInfo": True,
            "backgroundLibrary": False,
            "extensionsHost": False,
            "unsafe": "<script>alert(1)</script>&",
        },
        "reactShell": {"strict": True, "takeover": True},
    }
    script = build_workspace_react_features_script(unsafe_features)
    assert f"window.{WORKSPACE_REACT_FEATURES_GLOBAL}" in script
    assert "\\u003cscript" in script
    assert "\\u0026" in script
    assert "<script>alert(1)</script>&" not in script

    html = "<html><head></head><body></body></html>"
    injected = inject_workspace_react_features(html, mixed_features)
    assert injected.index(f"window.{WORKSPACE_REACT_FEATURES_GLOBAL}") < injected.lower().index("</head>")
    assert '"worldInfo":true' in injected
    assert '"extensionsHost":true' in injected

    assert inject_workspace_react_features(injected, mixed_features) == injected

    no_head_html = "<main>workspace</main>"
    prepended = inject_workspace_react_features(no_head_html, mixed_features)
    assert prepended.startswith("<script>")
    assert prepended.endswith(no_head_html)

    assert inject_workspace_react_features("", mixed_features) == ""
    assert inject_workspace_react_features(None, mixed_features) is None

    dock_document = {
        "WorldInfo": FakeElement("WorldInfo"),
        "right-nav-panel": FakeElement("right-nav-panel"),
    }
    dock_document["WorldInfo"].class_name = "drawer-content openDrawer pinnedOpen"

    dock_state = get_workspace_shell_panel_dock_state(dock_document, "worldInfo")
    assert dock_state == {"locked": True, "pinned": True}

    fallback_shell_result = create_workspace_shell_panel_result(dock_document, "worldInfo", False)
    assert fallback_shell_result == {
        "kind": "worldInfo",
        "locked": True,
        "mounted": False,
        "pinned": True,
        "reason": "feature-disabled",
        "status": "fallback",
    }
    assert normalize_workspace_panel_dock_status(fallback_shell_result) == "disabled"
    assert get_workspace_panel_visible_status_label("loading") == "opening"
    assert get_workspace_panel_visible_status_label("error") == "needs attention"
    assert get_workspace_panel_visible_status_label("disabled") == "using legacy panel"

    mounted_shell_result = create_workspace_shell_panel_result(dock_document, "characterLibrary", True)
    assert mounted_shell_result == {
        "kind": "characterLibrary",
        "locked": False,
        "mounted": True,
        "pinned": False,
        "status": "mounted",
    }
    assert normalize_workspace_panel_dock_status(mounted_shell_result) == "success"

    dock_snapshot = create_default_workspace_panel_dock_snapshot()
    dock_snapshot = record_workspace_panel_dock_intent(dock_snapshot, "characterLibrary", locked=True)
    assert dock_snapshot == {
        "activePanelKind": "characterLibrary",
        "activePanelStatus": "loading",
        "fallbackReason": None,
        "lockedPanelKinds": ["characterLibrary"],
        "openPanelKinds": ["characterLibrary"],
        "pinnedPanelKinds": [],
    }

    dock_snapshot = record_workspace_panel_dock_result(dock_snapshot, "worldInfo", {
        "fallbackReason": "feature-disabled",
        "pinned": True,
        "status": "fallback",
        "reason": "feature-disabled",
    })
    assert dock_snapshot == {
        "activePanelKind": "worldInfo",
        "activePanelStatus": "disabled",
        "fallbackReason": "feature-disabled",
        "lockedPanelKinds": ["characterLibrary"],
        "openPanelKinds": ["characterLibrary", "worldInfo"],
        "pinnedPanelKinds": ["worldInfo"],
    }

    dock_snapshot = record_workspace_panel_dock_result(dock_snapshot, "worldInfo", {
        "status": "success",
        "pinned": False,
    })
    assert dock_snapshot == {
        "activePanelKind": "worldInfo",
        "activePanelStatus": "success",
        "fallbackReason": None,
        "lockedPanelKinds": ["characterLibrary"],
        "openPanelKinds": ["characterLibrary", "worldInfo"],
        "pinnedPanelKinds": [],
    }

    disabled_panel_features = {
        "reactPages": {"settings": False},
        "reactPanels": {
            "mainChatMessageList": False,
            "worldInfo": False,
            "backgroundLibrary": False,
            "extensionsHost": False,
        },
        "reactShell": {"strict": False, "takeover": False},
    }
    disabled_loader = FakeWorkspacePanelsLoader([FakeWorkspacePanelModule()])
    disabled_errors = []
    disabled_world_info_document = {"wiEditorPanel": FakeElement("wiEditorPanel")}
    disabled_background_document = {"Backgrounds": FakeElement("Backgrounds")}
    disabled_extensions_document = {"rm_extensions_block": FakeElement("rm_extensions_block")}

    assert mount_world_info_panel(
        disabled_world_info_document,
        disabled_panel_features,
        disabled_loader,
        lambda error, kind: disabled_errors.append((error, kind)),
    ) is False
    assert WORLD_INFO_REACT_HOST_ID not in disabled_world_info_document

    assert mount_background_library_panel(
        disabled_background_document,
        disabled_panel_features,
        disabled_loader,
        lambda error, kind: disabled_errors.append((error, kind)),
    ) is False
    assert BACKGROUND_LIBRARY_REACT_HOST_ID not in disabled_background_document

    assert mount_extensions_host_panel(
        disabled_extensions_document,
        disabled_panel_features,
        disabled_loader,
        lambda error, kind: disabled_errors.append((error, kind)),
    ) is False
    assert EXTENSIONS_HOST_REACT_HOST_ID not in disabled_extensions_document
    assert disabled_loader.calls == []
    assert disabled_errors == []

    assert ensure_world_info_react_host({}) is None

    editor_panel = FakeElement("wiEditorPanel")
    world_popup = FakeElement("world_popup")
    editor_panel.append(world_popup)
    document = {
        "wiEditorPanel": editor_panel,
        "world_popup": world_popup,
    }
    world_info_host = ensure_world_info_react_host(document)
    assert world_info_host.id == WORLD_INFO_REACT_HOST_ID
    assert world_info_host.class_name == "emberdesk-react-world-info-panel-host"
    assert editor_panel.children == [world_info_host, world_popup]
    assert ensure_world_info_react_host(document) is world_info_host
    assert editor_panel.children == [world_info_host, world_popup]

    document["world_info"] = FakeElement("world_info")
    document["world_editor_select"] = FakeElement("world_editor_select", value="0")
    document["world_editor_select"].options = [FakeOption("", "--- Pick to Edit ---"), FakeOption("0", "World A", selected=True)]
    document["world_import_menu_item"] = FakeElement("world_import_menu_item")
    document["world_import_file"] = FakeElement("world_import_file")
    document["world_info_search"] = FakeElement("world_info_search", value="castle")
    document["world_info_sort_order"] = FakeElement("world_info_sort_order", value="custom")
    document["world_info_sort_order"].options = [FakeOption("custom", "Custom")]
    document["world_create_button"] = FakeElement("world_create_button")
    document["world_export_menu_item"] = FakeElement("world_export_menu_item")
    document["world_create_world"] = FakeElement("world_create_world")
    document["world_refresh"] = FakeElement("world_refresh")
    document["world_entries"] = [{"uid": "42", "title": "Entry 42", "disabled": False}]
    ready_world_info_state = get_world_info_react_bridge_state(document)
    assert ready_world_info_state == {
        "globalSelectorPresent": True,
        "editorSelectorPresent": True,
        "selectorsSeparated": True,
        "importMenuPresent": True,
        "importBusy": False,
        "dropTargetPresent": True,
        "worldNames": [{"value": "0", "label": "World A", "selected": True}],
        "selectedWorldName": "World A",
        "selectedWorldIndex": "0",
        "entryCount": 1,
        "entrySummaries": [{"uid": "42", "title": "Entry 42", "disabled": False}],
        "searchQuery": "castle",
        "sortValue": "custom",
        "sortOptions": [{"value": "custom", "label": "Custom", "hidden": False}],
        "canCreateEntry": True,
        "exportMenuPresent": True,
        "createWorldMenuPresent": True,
        "refreshMenuPresent": True,
    }

    document["world_import_menu_item"].attributes["aria-disabled"] = "true"
    assert get_world_info_react_bridge_state(document)["importBusy"] is True
    dispatch_world_info_action(document, "applySearchQuery", {"searchQuery": "dragon"})
    assert document["world_info_search"].value == "dragon"
    dispatch_world_info_action(document, "exportWorld")
    assert document["world_export_menu_item"].clicks == 1
    dispatch_world_info_action(document, "openEntry", {"uid": "42"})
    assert document["__opened_entry"] == "42"

    detached_popup_document = {"wiEditorPanel": FakeElement("wiEditorPanel")}
    fallback_host = ensure_world_info_react_host(detached_popup_document)
    assert detached_popup_document["wiEditorPanel"].children == [fallback_host]

    assert ensure_background_library_react_host({}) is None

    background_panel = FakeElement("Backgrounds")
    background_tabs = FakeElement("bg_tabs")
    background_panel.append(background_tabs)
    background_document = {
        "Backgrounds": background_panel,
        "bg_tabs": background_tabs,
        "bg_menu_content": FakeElement("bg_menu_content"),
        "bg_custom_content": FakeElement("bg_custom_content"),
        "bg-filter": FakeElement("bg-filter", value="forest"),
        "bg-sort": FakeElement("bg-sort", value="az"),
        "add_bg_button": FakeElement("add_bg_button"),
        "auto_background": FakeElement("auto_background"),
    }
    background_document["bg_menu_content"].append(FakeElement("system-one"))
    background_document["bg_menu_content"].children[0].class_name = "bg_example selected-background"
    background_document["bg_menu_content"].children[0].attributes.update({"bgfile": "system-a.png", "title": "System A"})
    background_document["bg_menu_content"].append(FakeElement("system-two"))
    background_document["bg_menu_content"].children[1].class_name = "bg_example"
    background_document["bg_menu_content"].children[1].attributes.update({"bgfile": "system-b.png", "title": "System B"})
    background_document["bg_custom_content"].append(FakeElement("chat-one"))
    background_document["bg_custom_content"].children[0].class_name = "bg_example locked-background"
    background_document["bg_custom_content"].children[0].attributes.update({"bgfile": "chat-a.png", "title": "Chat A"})

    background_host = ensure_background_library_react_host(background_document)
    assert background_host.id == BACKGROUND_LIBRARY_REACT_HOST_ID
    assert background_host.class_name == "emberdesk-react-background-library-panel-host"
    assert background_panel.children == [background_host, background_tabs]
    assert ensure_background_library_react_host(background_document) is background_host

    ready_background_state = get_background_library_react_bridge_state(background_document)
    assert ready_background_state == {
        "status": "success",
        "showLoading": False,
        "showEmpty": False,
        "showError": False,
        "systemContainerPresent": True,
        "chatContainerPresent": True,
        "systemItemCount": 2,
        "chatItemCount": 1,
        "refreshQueued": False,
        "systemBackgrounds": [
            {
                "id": "system-a.png",
                "title": "System A",
                "url": "",
                "isCustom": False,
                "animated": False,
                "selected": True,
                "locked": False,
            },
            {
                "id": "system-b.png",
                "title": "System B",
                "url": "",
                "isCustom": False,
                "animated": False,
                "selected": False,
                "locked": False,
            },
        ],
        "chatBackgrounds": [
            {
                "id": "chat-a.png",
                "title": "Chat A",
                "url": "",
                "isCustom": False,
                "animated": False,
                "selected": False,
                "locked": True,
            },
        ],
        "filterQuery": "forest",
        "sortValue": "az",
        "folderViewActive": False,
        "lockedCount": 1,
        "selectedCount": 1,
    }

    dispatch_background_library_action(background_document, "applyBackgroundFilter", {"filterQuery": "snow"})
    assert background_document["bg-filter"].value == "snow"
    dispatch_background_library_action(background_document, "selectBackground", {"source": "global", "id": "system-a.png"})
    assert background_document["__selected_background"] == ("global", "system-a.png")
    dispatch_background_library_action(background_document, "uploadBackground")
    assert background_document["add_bg_button"].clicks == 1

    loading_background_state = get_background_library_react_bridge_state(
        background_document,
        {"isLoading": True, "refreshQueued": True},
    )
    assert loading_background_state["status"] == "loading"
    assert loading_background_state["showLoading"] is True
    assert loading_background_state["refreshQueued"] is True

    error_background_state = get_background_library_react_bridge_state(
        background_document,
        {"error": "catalog failed"},
    )
    assert error_background_state["status"] == "error"
    assert error_background_state["showError"] is True

    empty_background_state = get_background_library_react_bridge_state({
        "bg_menu_content": FakeElement("bg_menu_content"),
        "bg_custom_content": FakeElement("bg_custom_content"),
    })
    assert empty_background_state["status"] == "empty"

    assert ensure_extensions_host_react_host({}) is None

    extensions_panel = FakeElement("rm_extensions_block")
    extensions_block = FakeElement("extensions_block")
    extensions_panel.append(extensions_block)
    extensions_document = {
        "rm_extensions_block": extensions_panel,
        "extensions_block": extensions_block,
        "extensions_settings": FakeElement("extensions_settings"),
        "extensions_settings2": FakeElement("extensions_settings2"),
        "regex_container": FakeElement("regex_container"),
        "extensionsMenuButton": FakeElement("extensionsMenuButton"),
        "extensionsMenu": FakeElement("extensionsMenu"),
        "extensions_status": FakeElement("extensions_status", text="Connected"),
        "extensions_url": FakeElement("extensions_url", value="http://localhost:5100"),
        "extensions_api_key": FakeElement("extensions_api_key", value="secret"),
        "extensions_connect": FakeElement("extensions_connect"),
        "extensions_autoconnect": FakeElement("extensions_autoconnect"),
        "extensions_notify_updates": FakeElement("extensions_notify_updates"),
        "extensions_details": FakeElement("extensions_details"),
        "third_party_extension_button": FakeElement("third_party_extension_button"),
        "extensions_startup_loading": FakeElement("extensions_startup_loading"),
    }
    extensions_document["extensions_notify_updates"].checked = True

    extensions_host = ensure_extensions_host_react_host(extensions_document)
    assert extensions_host.id == EXTENSIONS_HOST_REACT_HOST_ID
    assert extensions_host.class_name == "emberdesk-react-extensions-host-panel-host"
    assert extensions_panel.children == [extensions_host, extensions_block]
    assert ensure_extensions_host_react_host(extensions_document) is extensions_host

    ready_extensions_state = get_extensions_host_react_bridge_state(
        extensions_document,
        {"deferredState": "loading"},
    )
    assert ready_extensions_state == {
        "extensionsSettingsPresent": True,
        "extensionsSettings2Present": True,
        "regexContainerPresent": True,
        "extensionsMenuButtonPresent": True,
        "extensionsMenuPresent": True,
        "extrasApiControlsPresent": True,
        "manageButtonPresent": True,
        "installButtonPresent": True,
        "notifyUpdatesEnabled": True,
        "extrasApiUrl": "http://localhost:5100",
        "extrasApiKeySet": True,
        "autoconnectEnabled": False,
        "extrasStatusText": "Connected",
        "mountPointStatuses": [
            {"id": "extensions_settings", "label": "Settings column", "ready": True},
            {"id": "extensions_settings2", "label": "Settings column 2", "ready": True},
            {"id": "regex_container", "label": "Regex container", "ready": True},
            {"id": "extensionsMenuButton", "label": "Wand button", "ready": True},
            {"id": "extensionsMenu", "label": "Wand menu", "ready": True},
        ],
        "deferredState": "loading",
        "deferredPlaceholderPresent": True,
    }

    dispatch_extensions_host_action(extensions_document, "toggleNotifyUpdates")
    assert extensions_document["extensions_notify_updates"].checked is False
    dispatch_extensions_host_action(extensions_document, "updateExtrasApiUrl", {"url": "http://localhost:5200"})
    assert extensions_document["extensions_url"].value == "http://localhost:5200"
    dispatch_extensions_host_action(extensions_document, "connectExtrasApi")
    assert extensions_document["extensions_connect"].clicks == 1

    missing_extensions_state = get_extensions_host_react_bridge_state({})
    assert missing_extensions_state["extensionsSettingsPresent"] is False
    assert missing_extensions_state["extrasApiControlsPresent"] is False
    assert missing_extensions_state["deferredState"] == "idle"

    enabled_features = {"reactPanels": {"worldInfo": True}}
    disabled_features = {"reactPanels": {"worldInfo": False}}
    panel_module = FakeWorkspacePanelModule()
    loader = FakeWorkspacePanelsLoader([panel_module])
    errors = []
    capture_error = lambda error, kind: errors.append((error, kind))
    fake_bridge = {"dispatchAction": lambda action, payload=None: None}

    assert mount_react_workspace_panel("worldInfo", "host", disabled_features, loader, capture_error) is False
    assert mount_react_workspace_panel("worldInfo", None, enabled_features, loader, capture_error) is False
    assert loader.calls == []

    assert mount_react_workspace_panel("worldInfo", "host", enabled_features, loader, capture_error, ready_world_info_state, fake_bridge) is True
    assert loader.calls == [REACT_WORKSPACE_PANELS_ASSET_PATH]
    assert panel_module.mounted == [("worldInfo", "host", {"state": ready_world_info_state, "bridge": fake_bridge})]

    assert mount_react_workspace_panel("worldInfo", "host-2", enabled_features, loader, capture_error, {"dropTargetPresent": True}) is True
    assert loader.calls == [REACT_WORKSPACE_PANELS_ASSET_PATH]
    assert panel_module.mounted[-1] == ("worldInfo", "host-2", {"state": {"dropTargetPresent": True}, "bridge": None})

    recovered_module = FakeWorkspacePanelModule()
    failing_loader = FakeWorkspacePanelsLoader([RuntimeError("missing bundle"), recovered_module])
    assert mount_react_workspace_panel("worldInfo", "host", enabled_features, failing_loader, capture_error) is False
    assert errors[-1][1] == "worldInfo"
    assert mount_react_workspace_panel("worldInfo", "host", enabled_features, failing_loader, capture_error, {"selectorsSeparated": True}) is True
    assert failing_loader.calls == [
        REACT_WORKSPACE_PANELS_ASSET_PATH,
        REACT_WORKSPACE_PANELS_ASSET_PATH,
    ]
    assert recovered_module.mounted == [("worldInfo", "host", {"state": {"selectorsSeparated": True}, "bridge": None})]


if __name__ == "__main__":
    main()
