"""Sandbox proof for react_workspace_panel_flags_processing_flow.md.

Run with:
    uv run python .docs/logic-description/react_workspace_panel_flags_sandbox_proof.py
"""

import json


WORKSPACE_REACT_FEATURES_GLOBAL = "__emberDeskWorkspaceFeatures"
PANEL_NAMES = (
    "characterLibrary",
    "worldInfo",
    "backgroundLibrary",
    "extensionsHost",
)
REACT_WORKSPACE_PANELS_ASSET_PATH = "/react/login/assets/workspace-panels.js"
WORLD_INFO_REACT_HOST_ID = "emberdesk-react-world-info-panel-host"
BACKGROUND_LIBRARY_REACT_HOST_ID = "emberdesk-react-background-library-panel-host"
EXTENSIONS_HOST_REACT_HOST_ID = "emberdesk-react-extensions-host-panel-host"


def build_workspace_react_features(config):
    panels = {}
    configured_panels = config.get("features", {}).get("react", {}).get("panels", {})
    for panel_name in PANEL_NAMES:
        panels[panel_name] = configured_panels.get(panel_name) is True
    return {"reactPanels": panels}


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


class FakeElement:
    def __init__(self, element_id):
        self.id = element_id
        self.class_name = ""
        self.attributes = {}
        self.disabled = False
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

    def get_attribute(self, name):
        return self.attributes.get(name)

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
    }


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
    }


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
        "deferredState": state_overrides.get("deferredState", "idle"),
        "deferredPlaceholderPresent": deferred_placeholder is not None,
    }


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


def mount_react_workspace_panel(kind, container, features, loader, on_error, state=None):
    if not is_react_workspace_panel_enabled(kind, features) or container is None:
        return False

    try:
        panel_module = loader.load()
        panel_module.mount_workspace_panel(kind, container, {"state": state})
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
    )


def main():
    default_features = build_workspace_react_features({})
    assert default_features == {
        "reactPanels": {
            "characterLibrary": False,
            "worldInfo": False,
            "backgroundLibrary": False,
            "extensionsHost": False,
        }
    }

    mixed_features = build_workspace_react_features({
        "features": {
            "react": {
                "panels": {
                    "characterLibrary": True,
                    "worldInfo": True,
                    "backgroundLibrary": False,
                    "extensionsHost": True,
                }
            }
        }
    })
    assert mixed_features["reactPanels"]["characterLibrary"] is True
    assert mixed_features["reactPanels"]["worldInfo"] is True
    assert mixed_features["reactPanels"]["backgroundLibrary"] is False
    assert mixed_features["reactPanels"]["extensionsHost"] is True

    unsafe_features = {
        "reactPanels": {
            "characterLibrary": True,
            "worldInfo": True,
            "backgroundLibrary": False,
            "extensionsHost": False,
            "unsafe": "<script>alert(1)</script>&",
        }
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

    disabled_panel_features = {
        "reactPanels": {
            "worldInfo": False,
            "backgroundLibrary": False,
            "extensionsHost": False,
        }
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
    document["world_editor_select"] = FakeElement("world_editor_select")
    document["world_import_menu_item"] = FakeElement("world_import_menu_item")
    document["world_import_file"] = FakeElement("world_import_file")
    ready_world_info_state = get_world_info_react_bridge_state(document)
    assert ready_world_info_state == {
        "globalSelectorPresent": True,
        "editorSelectorPresent": True,
        "selectorsSeparated": True,
        "importMenuPresent": True,
        "importBusy": False,
        "dropTargetPresent": True,
    }

    document["world_import_menu_item"].attributes["aria-disabled"] = "true"
    assert get_world_info_react_bridge_state(document)["importBusy"] is True

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
    }
    background_document["bg_menu_content"].append(FakeElement("system-one"))
    background_document["bg_menu_content"].children[0].class_name = "bg_example"
    background_document["bg_menu_content"].append(FakeElement("system-two"))
    background_document["bg_menu_content"].children[1].class_name = "bg_example"
    background_document["bg_custom_content"].append(FakeElement("chat-one"))
    background_document["bg_custom_content"].children[0].class_name = "bg_example"

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
    }

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
        "extensions_status": FakeElement("extensions_status"),
        "extensions_url": FakeElement("extensions_url"),
        "extensions_api_key": FakeElement("extensions_api_key"),
        "extensions_connect": FakeElement("extensions_connect"),
        "extensions_autoconnect": FakeElement("extensions_autoconnect"),
        "extensions_details": FakeElement("extensions_details"),
        "third_party_extension_button": FakeElement("third_party_extension_button"),
        "extensions_startup_loading": FakeElement("extensions_startup_loading"),
    }

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
        "deferredState": "loading",
        "deferredPlaceholderPresent": True,
    }

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

    assert mount_react_workspace_panel("worldInfo", "host", disabled_features, loader, capture_error) is False
    assert mount_react_workspace_panel("worldInfo", None, enabled_features, loader, capture_error) is False
    assert loader.calls == []

    assert mount_react_workspace_panel("worldInfo", "host", enabled_features, loader, capture_error, ready_world_info_state) is True
    assert loader.calls == [REACT_WORKSPACE_PANELS_ASSET_PATH]
    assert panel_module.mounted == [("worldInfo", "host", {"state": ready_world_info_state})]

    assert mount_react_workspace_panel("worldInfo", "host-2", enabled_features, loader, capture_error, {"dropTargetPresent": True}) is True
    assert loader.calls == [REACT_WORKSPACE_PANELS_ASSET_PATH]
    assert panel_module.mounted[-1] == ("worldInfo", "host-2", {"state": {"dropTargetPresent": True}})

    recovered_module = FakeWorkspacePanelModule()
    failing_loader = FakeWorkspacePanelsLoader([RuntimeError("missing bundle"), recovered_module])
    assert mount_react_workspace_panel("worldInfo", "host", enabled_features, failing_loader, capture_error) is False
    assert errors[-1][1] == "worldInfo"
    assert mount_react_workspace_panel("worldInfo", "host", enabled_features, failing_loader, capture_error, {"selectorsSeparated": True}) is True
    assert failing_loader.calls == [
        REACT_WORKSPACE_PANELS_ASSET_PATH,
        REACT_WORKSPACE_PANELS_ASSET_PATH,
    ]
    assert recovered_module.mounted == [("worldInfo", "host", {"state": {"selectorsSeparated": True}})]


if __name__ == "__main__":
    main()
