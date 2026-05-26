"""Sandbox proof for character_list_state_processing_flow.md.

Run with:
    uv run python .docs/logic-description/character_list_state_sandbox_proof.py
"""


def resolve_character_avatars_by_ids(characters, character_ids):
    avatars = []
    for character_id in character_ids:
        if character_id < 0 or character_id >= len(characters):
            continue
        avatar = characters[character_id].get("avatar")
        if isinstance(avatar, str) and avatar:
            avatars.append(avatar)
    return avatars


def get_character_delete_candidates(characters, avatars):
    candidates = []
    for avatar in avatars:
        if not isinstance(avatar, str) or not avatar:
            continue
        index = next((idx for idx, character in enumerate(characters) if character.get("avatar") == avatar), -1)
        candidates.append(
            {
                "avatar": avatar,
                "character": None if index == -1 else characters[index],
                "index": index,
            }
        )
    return candidates


def remove_characters_from_state(characters, avatars):
    avatar_set = set(avatars)
    removed = []

    for index in range(len(characters) - 1, -1, -1):
        if characters[index].get("avatar") not in avatar_set:
            continue
        removed.insert(0, characters.pop(index))

    return removed


def should_refresh_character_after_edit(characters, avatar):
    return isinstance(avatar, str) and bool(avatar) and any(character.get("avatar") == avatar for character in characters)


class FakeClassList:
    def __init__(self):
        self.values = set()

    def toggle(self, class_name, enabled):
        if enabled:
            self.values.add(class_name)
        else:
            self.values.discard(class_name)

    def contains(self, class_name):
        return class_name in self.values


class FakeElement:
    def __init__(self, attributes=None, checkbox=None):
        self.attributes = dict(attributes or {})
        self.checkbox = checkbox
        self.class_list = FakeClassList()
        self.text_content = ""
        self.blurred = False
        self.focused = False

    def set_attribute(self, name, value):
        self.attributes[name] = str(value)

    def get_attribute(self, name):
        return self.attributes.get(name)

    def query_selector(self, selector):
        if selector == ".bulk_select_checkbox":
            return self.checkbox
        return None

    def blur(self):
        self.blurred = True

    def focus(self):
        self.focused = True


class FakeCheckbox:
    def __init__(self):
        self.checked = False


class FakeContainer:
    def __init__(self, rows):
        self.rows = rows

    def get_elements_by_class_name(self, class_name):
        if class_name == "character_select":
            return self.rows
        return []


def update_bulk_delete_button_state(delete_button, has_selection, fallback_focus_element=None, active_element=None):
    if delete_button is None:
        return

    is_disabled = not has_selection
    delete_button.class_list.toggle("disabled", is_disabled)
    delete_button.set_attribute("aria-disabled", str(is_disabled).lower())

    if is_disabled:
        delete_button.set_attribute("tabindex", "-1")
        if active_element is delete_button:
            delete_button.blur()
            if fallback_focus_element is not None:
                fallback_focus_element.focus()
        return

    delete_button.set_attribute("tabindex", "0")


def update_bulk_selection_count_state(options, count, active_element=None):
    update_bulk_delete_button_state(
        options.get("delete_button"),
        count > 0,
        options.get("fallback_focus_element"),
        active_element,
    )

    selected_count = options.get("selected_count")
    if selected_count is None:
        return

    selected_count.text_content = f"{count} selected"
    selected_count.set_attribute("title", f"{count} characters selected")
    selected_count.set_attribute("aria-label", f"{count} characters selected")


def sync_bulk_selection_dom_state(
    container,
    selected_character_ids,
    character_class="character_select",
    selected_class="character_selected",
    checkbox_class="bulk_select_checkbox",
):
    if container is None:
        return 0

    selected_id_set = {int(character_id) for character_id in selected_character_ids}
    visible_selected_count = 0

    for character in container.get_elements_by_class_name(character_class):
        character_id = int(character.get_attribute("data-chid"))
        is_selected = character_id in selected_id_set
        checkbox = character.query_selector("." + checkbox_class)

        character.class_list.toggle(selected_class, is_selected)
        character.set_attribute("aria-selected", str(is_selected).lower())
        if checkbox is not None:
            checkbox.checked = is_selected
        if is_selected:
            visible_selected_count += 1

    return visible_selected_count


def main():
    characters = [
        {"avatar": "alpha.png", "name": "Alpha"},
        {"avatar": "beta.png", "name": "Beta"},
        {"avatar": "", "name": "No Avatar"},
        {"name": "Missing Avatar"},
        {"avatar": "gamma.png", "name": "Gamma"},
    ]

    assert resolve_character_avatars_by_ids(characters, [0, 1, 2, 3, 4, 99]) == [
        "alpha.png",
        "beta.png",
        "gamma.png",
    ]

    assert get_character_delete_candidates(characters, ["beta.png", "", None, "missing.png"]) == [
        {"avatar": "beta.png", "character": {"avatar": "beta.png", "name": "Beta"}, "index": 1},
        {"avatar": "missing.png", "character": None, "index": -1},
    ]

    removed = remove_characters_from_state(characters, ["beta.png", "gamma.png"])
    assert removed == [
        {"avatar": "beta.png", "name": "Beta"},
        {"avatar": "gamma.png", "name": "Gamma"},
    ]
    assert [character.get("avatar") for character in characters] == ["alpha.png", "", None]

    assert should_refresh_character_after_edit(characters, "alpha.png") is True
    assert should_refresh_character_after_edit(characters, "beta.png") is False
    assert should_refresh_character_after_edit(characters, "") is False
    assert should_refresh_character_after_edit(characters, None) is False

    delete_button = FakeElement()
    fallback = FakeElement()
    update_bulk_delete_button_state(delete_button, False, fallback, active_element=delete_button)
    assert delete_button.class_list.contains("disabled") is True
    assert delete_button.get_attribute("aria-disabled") == "true"
    assert delete_button.get_attribute("tabindex") == "-1"
    assert delete_button.blurred is True
    assert fallback.focused is True

    update_bulk_delete_button_state(delete_button, True, fallback, active_element=delete_button)
    assert delete_button.class_list.contains("disabled") is False
    assert delete_button.get_attribute("aria-disabled") == "false"
    assert delete_button.get_attribute("tabindex") == "0"

    selected_count = FakeElement()
    update_bulk_selection_count_state(
        {"selected_count": selected_count, "delete_button": delete_button, "fallback_focus_element": fallback},
        2,
    )
    assert selected_count.text_content == "2 selected"
    assert selected_count.get_attribute("title") == "2 characters selected"
    assert selected_count.get_attribute("aria-label") == "2 characters selected"
    assert delete_button.get_attribute("aria-disabled") == "false"

    alpha = FakeElement({"data-chid": "0"}, FakeCheckbox())
    beta = FakeElement({"data-chid": "1"}, FakeCheckbox())
    gamma = FakeElement({"data-chid": "2"}, FakeCheckbox())
    container = FakeContainer([alpha, beta, gamma])

    visible_selected_count = sync_bulk_selection_dom_state(container, [0, 2])
    assert visible_selected_count == 2
    assert alpha.class_list.contains("character_selected") is True
    assert alpha.get_attribute("aria-selected") == "true"
    assert alpha.checkbox.checked is True
    assert beta.class_list.contains("character_selected") is False
    assert beta.get_attribute("aria-selected") == "false"
    assert beta.checkbox.checked is False
    assert gamma.class_list.contains("character_selected") is True
    assert gamma.get_attribute("aria-selected") == "true"
    assert gamma.checkbox.checked is True

    assert sync_bulk_selection_dom_state(None, [0]) == 0


if __name__ == "__main__":
    main()
