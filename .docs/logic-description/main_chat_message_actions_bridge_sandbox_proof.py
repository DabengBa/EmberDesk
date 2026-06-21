"""Sandbox proof for main_chat_message_actions_bridge_processing_flow.md.

Run with:
    uv run python .docs/logic-description/main_chat_message_actions_bridge_sandbox_proof.py
"""


MESSAGE_ACTION_TIERS = {
    "highFrequency": ["extraMesButtonsHint", "mes_copy", "mes_edit"],
    "secondary": ["mes_bookmark", "mes_swipe_picker", "mes_reasoning_copy", "mes_gallery", "mes_translate", "mes_narrate", "mes_hide"],
    "danger": ["mes_edit_delete", "mes_reasoning_delete"],
}

GENERIC_MESSAGE_ACTION_CLASSES = {
    "mes_button",
    "menu_button",
    "edit_button",
    "right_menu_button",
    "interactable",
    "displayNone",
}


class FakeElement:
    def __init__(self, *, classes=None, role=None, attrs=None, style=None):
        self.classes = list(classes or [])
        self.role = role
        self.attrs = dict(attrs or {})
        self.style = dict(style or {})
        self.children = []
        self.parent = None
        self.is_connected = True

    def append(self, child):
        child.parent = self
        self.children.append(child)
        return child

    def get_attribute(self, name):
        return self.attrs.get(name)

    def class_contains(self, name):
        return name in self.classes

    def find_first_by_class(self, class_name):
        for child in self.walk():
            if child.class_contains(class_name):
                return child
        return None

    def find_role_buttons(self):
        return [child for child in self.walk() if child.role == "button"]

    def walk(self):
        for child in self.children:
            yield child
            yield from child.walk()


def get_message_action_name_from_class_list(class_list):
    for class_name in class_list or []:
        if not class_name or class_name in GENERIC_MESSAGE_ACTION_CLASSES or class_name.startswith("fa-"):
            continue

        if (
            class_name == "extraMesButtonsHint"
            or class_name == "swipe_left"
            or class_name == "swipe_right"
            or class_name == "generation_failure_retry"
            or class_name.startswith("sd_")
        ):
            return class_name

        if class_name.startswith("mes_"):
            return class_name

    return None


def get_visible_message_action_names(message_row):
    available_actions = []
    seen_actions = set()

    for action_node in message_row.find_role_buttons():
        action_name = get_message_action_name_from_class_list(action_node.classes)
        if not action_name or action_name in seen_actions:
            continue

        seen_actions.add(action_name)
        available_actions.append(action_name)

    return available_actions


def build_message_action_snapshot(message_row, *, get_expand_message_actions):
    if not isinstance(message_row, FakeElement):
        return None

    message_id = str(message_row.get_attribute("mesid") or "").strip()
    if not message_id or message_row.find_first_by_class("mes_buttons") is None:
        return None

    available_actions = get_visible_message_action_names(message_row)
    extra_buttons = message_row.find_first_by_class("extraMesButtons")
    extra_actions_hint = message_row.find_first_by_class("extraMesButtonsHint")
    expanded = bool(
        get_expand_message_actions()
        or (extra_buttons is not None and extra_buttons.class_contains("visible"))
        or (extra_actions_hint is not None and extra_actions_hint.style.get("display") == "none")
    )

    return {
        "schema": "mainChatMessageActionSnapshotSchema",
        "messageId": message_id,
        "eligible": True,
        "expanded": expanded,
        "availableActions": available_actions,
        "highFrequencyActions": [name for name in MESSAGE_ACTION_TIERS["highFrequency"] if name in available_actions],
        "secondaryActions": [name for name in MESSAGE_ACTION_TIERS["secondary"] if name in available_actions],
        "dangerActions": [name for name in MESSAGE_ACTION_TIERS["danger"] if name in available_actions],
    }


def validate_snapshot(snapshot):
    if not isinstance(snapshot, dict):
        return None
    if snapshot.get("schema") != "mainChatMessageActionSnapshotSchema":
        return None
    if not isinstance(snapshot.get("messageId"), str) or not snapshot["messageId"]:
        return None
    if snapshot.get("eligible") is not True or not isinstance(snapshot.get("expanded"), bool):
        return None

    for key in ("availableActions", "highFrequencyActions", "secondaryActions", "dangerActions"):
        values = snapshot.get(key)
        if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
            return None

    return snapshot


def get_message_action_row_targets(message_row):
    message_buttons = message_row.find_first_by_class("mes_buttons")
    extra_actions_hint = message_buttons.find_first_by_class("extraMesButtonsHint") if isinstance(message_buttons, FakeElement) else None
    extra_actions = message_buttons.find_first_by_class("extraMesButtons") if isinstance(message_buttons, FakeElement) else None
    if not all(isinstance(node, FakeElement) for node in (message_buttons, extra_actions_hint, extra_actions)):
        return None
    return {
        "messageButtons": message_buttons,
        "extraActionsHint": extra_actions_hint,
        "extraActions": extra_actions,
    }


def can_react_own_message_actions(message_row, snapshot):
    if not isinstance(message_row, FakeElement):
        return False
    if message_row.is_connected is not True:
        return False
    if message_row.parent is None or message_row.parent.get_attribute("id") != "chat":
        return False
    if message_row.get_attribute("mesid") != snapshot["messageId"]:
        return False
    return get_message_action_row_targets(message_row) is not None


def render_hidden_marker(message_row, snapshot):
    validated = validate_snapshot(snapshot)
    if validated is None or not can_react_own_message_actions(message_row, validated):
        return None

    targets = get_message_action_row_targets(message_row)
    marker = FakeElement(attrs={
        "data-main-chat-message-actions-owner": "react",
        "data-main-chat-message-actions-row": validated["messageId"],
        "data-main-chat-message-actions-expanded": "true" if validated["expanded"] else "false",
        "data-main-chat-message-actions-available": "|".join(validated["availableActions"]),
        "data-main-chat-message-actions-high-frequency": "|".join(validated["highFrequencyActions"]),
        "data-main-chat-message-actions-secondary": "|".join(validated["secondaryActions"]),
        "data-main-chat-message-actions-danger": "|".join(validated["dangerActions"]),
    })
    targets["messageButtons"].append(marker)
    return marker


def make_action_button(*classes):
    return FakeElement(classes=list(classes), role="button")


def make_row(message_id):
    chat_container = FakeElement(attrs={"id": "chat"})
    row = FakeElement(attrs={"mesid": str(message_id)})
    chat_container.append(row)
    message_buttons = row.append(FakeElement(classes=["mes_buttons"]))
    extra_hint = message_buttons.append(make_action_button("extraMesButtonsHint", "menu_button"))
    extra_menu = message_buttons.append(FakeElement(classes=["extraMesButtons"]))
    return chat_container, row, message_buttons, extra_hint, extra_menu


def main():
    chat_container, row, message_buttons, extra_hint, extra_menu = make_row(12)
    row.append(make_action_button("mes_copy", "mes_button"))
    row.append(make_action_button("mes_edit", "mes_button"))
    row.append(make_action_button("mes_edit_delete", "mes_button"))
    row.append(make_action_button("mes_copy", "mes_button", "fa-copy"))
    row.append(make_action_button("menu_button", "fa-ellipsis"))

    snapshot = build_message_action_snapshot(row, get_expand_message_actions=lambda: False)
    assert snapshot == {
        "schema": "mainChatMessageActionSnapshotSchema",
        "messageId": "12",
        "eligible": True,
        "expanded": False,
        "availableActions": ["extraMesButtonsHint", "mes_copy", "mes_edit", "mes_edit_delete"],
        "highFrequencyActions": ["extraMesButtonsHint", "mes_copy", "mes_edit"],
        "secondaryActions": [],
        "dangerActions": ["mes_edit_delete"],
    }

    expanded_from_setting = build_message_action_snapshot(row, get_expand_message_actions=lambda: True)
    assert expanded_from_setting["expanded"] is True

    extra_menu.classes.append("visible")
    expanded_from_menu = build_message_action_snapshot(row, get_expand_message_actions=lambda: False)
    assert expanded_from_menu["expanded"] is True
    extra_menu.classes.remove("visible")

    extra_hint.style["display"] = "none"
    expanded_from_hidden_hint = build_message_action_snapshot(row, get_expand_message_actions=lambda: False)
    assert expanded_from_hidden_hint["expanded"] is True
    extra_hint.style["display"] = ""

    row_without_buttons = FakeElement(attrs={"mesid": "13"})
    assert build_message_action_snapshot(row_without_buttons, get_expand_message_actions=lambda: False) is None

    marker = render_hidden_marker(row, snapshot)
    assert marker is not None
    assert marker.get_attribute("data-main-chat-message-actions-owner") == "react"
    assert marker.get_attribute("data-main-chat-message-actions-row") == "12"
    assert marker.get_attribute("data-main-chat-message-actions-available") == "extraMesButtonsHint|mes_copy|mes_edit|mes_edit_delete"
    assert message_buttons.children[0] is extra_hint
    assert message_buttons.children[1] is extra_menu
    assert message_buttons.children[-1] is marker

    disconnected_row = row
    disconnected_row.is_connected = False
    assert render_hidden_marker(disconnected_row, snapshot) is None
    disconnected_row.is_connected = True

    _, row_missing_hint, _, _, _ = make_row(22)
    missing_hint_buttons = row_missing_hint.find_first_by_class("mes_buttons")
    missing_hint_buttons.children = [child for child in missing_hint_buttons.children if not child.class_contains("extraMesButtonsHint")]
    assert render_hidden_marker(row_missing_hint, {
        "schema": "mainChatMessageActionSnapshotSchema",
        "messageId": "22",
        "eligible": True,
        "expanded": False,
        "availableActions": ["mes_copy"],
        "highFrequencyActions": ["mes_copy"],
        "secondaryActions": [],
        "dangerActions": [],
    }) is None

    malformed = dict(snapshot)
    malformed["expanded"] = "false"
    assert render_hidden_marker(row, malformed) is None


if __name__ == "__main__":
    main()
