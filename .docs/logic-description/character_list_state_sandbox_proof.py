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


def should_suppress_character_delete_list_reprint(is_reconcile_in_progress, started_at_generation, current_generation):
    return is_reconcile_in_progress or started_at_generation < current_generation


def get_character_list_entity_key(entity):
    entity_type = entity.get("type", "unknown")
    entity_id = entity.get("id", "unknown")
    item = entity.get("item") or {}

    if entity_type == "character":
        return f"character:{item.get('avatar') or entity_id}"
    if entity_type == "group":
        return f"group:{item.get('id') or entity_id}"
    if entity_type == "tag":
        return f"tag:{item.get('id') or entity_id}"
    return f"{entity_type}:{entity_id}"


def create_character_list_entity_snapshot(entities):
    snapshot_entities = []
    for render_index, entity in enumerate(entities):
        snapshot_entity = dict(entity)
        snapshot_entity["renderIndex"] = render_index
        snapshot_entity["renderKey"] = get_character_list_entity_key(entity)
        snapshot_entities.append(snapshot_entity)

    return {
        "entities": snapshot_entities,
        "total": len(snapshot_entities),
        "keys": [entity["renderKey"] for entity in snapshot_entities],
    }


def get_character_list_pagination_range_label(current_page, total_number, page_size, fallback_total=0):
    actual_total = total_number or fallback_total
    current_page_size = page_size or 1
    safe_current_page = current_page or 1
    range_start = ((safe_current_page - 1) * current_page_size + 1) if actual_total > 0 else 0
    range_end = min(safe_current_page * current_page_size, actual_total)
    return f"{range_start}-{range_end} / {actual_total}"


def create_character_list_page_render_plan(
    page_entities,
    include_back_block=False,
    total_characters=0,
    total_groups=0,
    has_active_filter=False,
):
    display_count = sum(1 for entity in page_entities if entity.get("type") in {"character", "group"})
    hidden_count = (total_characters + total_groups) - display_count

    return {
        "pageEntities": page_entities,
        "includeBackBlock": include_back_block,
        "displayCount": display_count,
        "hiddenCount": hidden_count,
        "showEmptyBlock": len(page_entities) == 0,
        "showHiddenBlock": hidden_count > 0 and has_active_filter,
    }


def create_character_list_page_reconcile_plan(
    before_page_entities,
    after_snapshot,
    page_entities,
    current_page,
    page_size,
    total_characters,
    total_groups,
    has_active_filter=False,
    include_back_block=False,
):
    def fallback(reason):
        return {"mode": "fallback", "reason": reason}

    if include_back_block:
        return fallback("back-block")
    if not isinstance(before_page_entities, list) or not isinstance(page_entities, list) or after_snapshot is None:
        return fallback("missing-entity-data")

    before_keys = [entity.get("renderKey") or get_character_list_entity_key(entity) for entity in before_page_entities]
    after_keys = after_snapshot.get("keys", [])
    ordered_keys = [entity.get("renderKey") or get_character_list_entity_key(entity) for entity in page_entities]

    if len(set(before_keys)) != len(before_keys) or len(set(after_keys)) != len(after_keys) or len(set(ordered_keys)) != len(ordered_keys):
        return fallback("duplicate-entity-key")

    before_key_set = set(before_keys)
    ordered_key_set = set(ordered_keys)
    safe_page_size = page_size or 1
    safe_current_page = max(current_page or 1, 1)

    return {
        "mode": "incremental",
        "orderedKeys": ordered_keys,
        "reusedKeys": [key for key in ordered_keys if key in before_key_set],
        "insertedKeys": [key for key in ordered_keys if key not in before_key_set],
        "removedKeys": [key for key in before_keys if key not in ordered_key_set],
        "renderPlan": create_character_list_page_render_plan(
            page_entities,
            include_back_block=False,
            total_characters=total_characters,
            total_groups=total_groups,
            has_active_filter=has_active_filter,
        ),
        "requiresIdentitySync": True,
        "paginationLabel": get_character_list_pagination_range_label(
            safe_current_page,
            after_snapshot["total"],
            safe_page_size,
        ),
        "currentPage": safe_current_page,
        "pageSize": safe_page_size,
    }


def create_character_delete_reconcile_plan(
    before_snapshot,
    after_snapshot,
    deleted_avatars,
    current_page,
    page_size,
    has_active_filter=False,
    is_bulk_edit=False,
    is_bogus_folder_open=False,
    is_print_pending=False,
):
    def fallback(reason):
        return {"mode": "fallback", "reason": reason}

    if not isinstance(deleted_avatars, list) or len(deleted_avatars) != 1:
        return fallback("multi-delete")
    if has_active_filter:
        return fallback("active-filter")
    if is_bulk_edit:
        return fallback("bulk-edit")
    if is_bogus_folder_open:
        return fallback("bogus-folder")
    if is_print_pending:
        return fallback("print-pending")

    deleted_key = f"character:{deleted_avatars[0]}"
    if deleted_key not in before_snapshot.get("keys", []):
        return fallback("missing-before-entity")
    if deleted_key in after_snapshot.get("keys", []):
        return fallback("still-present-after-delete")

    safe_page_size = page_size or 1
    total_pages = max((after_snapshot.get("total", 0) + safe_page_size - 1) // safe_page_size, 1)
    safe_current_page = min(max(current_page or 1, 1), total_pages)
    page_start = (safe_current_page - 1) * safe_page_size
    page_entities = after_snapshot["entities"][page_start : page_start + safe_page_size]

    return {
        "mode": "incremental",
        "deletedKeys": [deleted_key],
        "pageEntities": page_entities,
        "requiresIdentitySync": True,
        "paginationLabel": get_character_list_pagination_range_label(
            safe_current_page,
            after_snapshot["total"],
            safe_page_size,
        ),
        "currentPage": safe_current_page,
        "pageSize": safe_page_size,
    }


def create_character_bulk_delete_page_plan(
    after_snapshot,
    deleted_avatars,
    current_page,
    page_size,
    has_active_filter=False,
    is_bogus_folder_open=False,
    is_print_pending=False,
):
    def fallback(reason):
        return {"mode": "fallback", "reason": reason}

    if not isinstance(deleted_avatars, list) or len(deleted_avatars) == 0:
        return fallback("no-deleted-avatars")
    if has_active_filter:
        return fallback("active-filter")
    if is_bogus_folder_open:
        return fallback("bogus-folder")
    if is_print_pending:
        return fallback("print-pending")
    if after_snapshot is None or not isinstance(after_snapshot.get("entities"), list):
        return fallback("missing-after-entity")
    after_keys = after_snapshot.get("keys", [])
    if len(set(after_keys)) != len(after_keys):
        return fallback("duplicate-entity-key")

    safe_page_size = page_size or 1
    total_pages = max((after_snapshot.get("total", 0) + safe_page_size - 1) // safe_page_size, 1)
    safe_current_page = min(max(current_page or 1, 1), total_pages)
    page_start = (safe_current_page - 1) * safe_page_size
    page_entities = after_snapshot["entities"][page_start : page_start + safe_page_size]

    return {
        "mode": "incremental",
        "deletedKeys": [f"character:{avatar}" for avatar in deleted_avatars],
        "pageEntities": page_entities,
        "requiresIdentitySync": True,
        "paginationLabel": get_character_list_pagination_range_label(
            safe_current_page,
            after_snapshot["total"],
            safe_page_size,
        ),
        "currentPage": safe_current_page,
        "pageSize": safe_page_size,
    }


def run_delete_character_close_preflight(is_generation_in_progress, calls):
    if is_generation_in_progress:
        calls.append("blocked")
        return False

    calls.extend(
        [
            "wait",
            "clear",
            "reset-group",
            "reset-selection",
            "select-characters-view",
            "suppress-welcome-screen",
            "emit-chat-changed",
        ]
    )
    return True


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


def get_bulk_selection_short_count_text(count, locale="en"):
    return f"{count}个" if str(locale).lower().startswith("zh") else f"{count} sel"


def update_bulk_selection_count_state(options, count, active_element=None, locale="en"):
    update_bulk_delete_button_state(
        options.get("delete_button"),
        count > 0,
        options.get("fallback_focus_element"),
        active_element,
    )

    selected_count = options.get("selected_count")
    if selected_count is None:
        return

    selected_count.text_content = get_bulk_selection_short_count_text(count, locale)
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

    assert should_suppress_character_delete_list_reprint(True, 3, 3) is True
    assert should_suppress_character_delete_list_reprint(False, 2, 3) is True
    assert should_suppress_character_delete_list_reprint(False, 3, 3) is False

    blocked_calls = []
    assert run_delete_character_close_preflight(True, blocked_calls) is False
    assert blocked_calls == ["blocked"]

    preflight_calls = []
    assert run_delete_character_close_preflight(False, preflight_calls) is True
    assert preflight_calls == [
        "wait",
        "clear",
        "reset-group",
        "reset-selection",
        "select-characters-view",
        "suppress-welcome-screen",
        "emit-chat-changed",
    ]

    before_snapshot = create_character_list_entity_snapshot(
        [
            {"type": "character", "id": 0, "item": {"avatar": "alpha.png"}},
            {"type": "character", "id": 1, "item": {"avatar": "beta.png"}},
            {"type": "character", "id": 2, "item": {"avatar": "gamma.png"}},
        ]
    )
    ordinary_after_snapshot = create_character_list_entity_snapshot(
        [
            {"type": "character", "id": 0, "item": {"avatar": "gamma.png"}},
            {"type": "character", "id": 1, "item": {"avatar": "alpha.png"}},
            {"type": "character", "id": 2, "item": {"avatar": "delta.png"}},
        ]
    )
    page_reconcile_plan = create_character_list_page_reconcile_plan(
        before_snapshot["entities"],
        ordinary_after_snapshot,
        ordinary_after_snapshot["entities"],
        current_page=1,
        page_size=3,
        total_characters=3,
        total_groups=0,
    )
    assert page_reconcile_plan["mode"] == "incremental"
    assert page_reconcile_plan["orderedKeys"] == [
        "character:gamma.png",
        "character:alpha.png",
        "character:delta.png",
    ]
    assert page_reconcile_plan["reusedKeys"] == ["character:gamma.png", "character:alpha.png"]
    assert page_reconcile_plan["insertedKeys"] == ["character:delta.png"]
    assert page_reconcile_plan["removedKeys"] == ["character:beta.png"]
    assert page_reconcile_plan["renderPlan"]["showEmptyBlock"] is False
    assert page_reconcile_plan["renderPlan"]["showHiddenBlock"] is False
    assert page_reconcile_plan["paginationLabel"] == "1-3 / 3"

    duplicate_snapshot = create_character_list_entity_snapshot(
        [
            {"type": "character", "id": 0, "item": {"avatar": "alpha.png"}},
            {"type": "character", "id": 1, "item": {"avatar": "alpha.png"}},
        ]
    )
    assert create_character_list_page_reconcile_plan(
        before_snapshot["entities"],
        duplicate_snapshot,
        duplicate_snapshot["entities"],
        current_page=1,
        page_size=2,
        total_characters=2,
        total_groups=0,
    ) == {"mode": "fallback", "reason": "duplicate-entity-key"}
    assert create_character_list_page_reconcile_plan(
        before_snapshot["entities"],
        ordinary_after_snapshot,
        ordinary_after_snapshot["entities"],
        current_page=1,
        page_size=3,
        total_characters=3,
        total_groups=0,
        include_back_block=True,
    ) == {"mode": "fallback", "reason": "back-block"}

    after_snapshot = create_character_list_entity_snapshot(
        [
            {"type": "character", "id": 0, "item": {"avatar": "alpha.png"}},
            {"type": "character", "id": 1, "item": {"avatar": "gamma.png"}},
        ]
    )
    delete_plan = create_character_delete_reconcile_plan(
        before_snapshot,
        after_snapshot,
        ["beta.png"],
        current_page=1,
        page_size=2,
    )
    assert delete_plan["mode"] == "incremental"
    assert delete_plan["deletedKeys"] == ["character:beta.png"]
    assert [entity["renderKey"] for entity in delete_plan["pageEntities"]] == [
        "character:alpha.png",
        "character:gamma.png",
    ]
    assert delete_plan["requiresIdentitySync"] is True
    assert delete_plan["paginationLabel"] == "1-2 / 2"
    assert delete_plan["currentPage"] == 1
    assert delete_plan["pageSize"] == 2

    assert create_character_delete_reconcile_plan(
        before_snapshot,
        after_snapshot,
        ["beta.png", "gamma.png"],
        current_page=1,
        page_size=2,
    ) == {"mode": "fallback", "reason": "multi-delete"}
    assert create_character_delete_reconcile_plan(
        before_snapshot,
        after_snapshot,
        ["beta.png"],
        current_page=1,
        page_size=2,
        has_active_filter=True,
    ) == {"mode": "fallback", "reason": "active-filter"}
    assert create_character_delete_reconcile_plan(
        before_snapshot,
        after_snapshot,
        ["beta.png"],
        current_page=1,
        page_size=2,
        is_bulk_edit=True,
    ) == {"mode": "fallback", "reason": "bulk-edit"}
    assert create_character_delete_reconcile_plan(
        before_snapshot,
        after_snapshot,
        ["beta.png"],
        current_page=1,
        page_size=2,
        is_bogus_folder_open=True,
    ) == {"mode": "fallback", "reason": "bogus-folder"}
    assert create_character_delete_reconcile_plan(
        before_snapshot,
        after_snapshot,
        ["missing.png"],
        current_page=1,
        page_size=2,
    ) == {"mode": "fallback", "reason": "missing-before-entity"}
    assert create_character_delete_reconcile_plan(
        before_snapshot,
        before_snapshot,
        ["beta.png"],
        current_page=1,
        page_size=2,
    ) == {"mode": "fallback", "reason": "still-present-after-delete"}

    bulk_after_snapshot = create_character_list_entity_snapshot(
        [
            {"type": "character", "id": 0, "item": {"avatar": "alpha.png"}},
            {"type": "character", "id": 1, "item": {"avatar": "bravo.png"}},
            {"type": "character", "id": 2, "item": {"avatar": "charlie.png"}},
            {"type": "character", "id": 3, "item": {"avatar": "delta.png"}},
            {"type": "character", "id": 4, "item": {"avatar": "echo.png"}},
            {"type": "character", "id": 5, "item": {"avatar": "hotel.png"}},
            {"type": "character", "id": 6, "item": {"avatar": "india.png"}},
            {"type": "character", "id": 7, "item": {"avatar": "juliet.png"}},
            {"type": "character", "id": 8, "item": {"avatar": "kilo.png"}},
            {"type": "character", "id": 9, "item": {"avatar": "lima.png"}},
        ]
    )
    bulk_plan = create_character_bulk_delete_page_plan(
        bulk_after_snapshot,
        ["foxtrot.png", "golf.png"],
        current_page=2,
        page_size=5,
    )
    assert bulk_plan["mode"] == "incremental"
    assert bulk_plan["currentPage"] == 2
    assert [entity["renderKey"] for entity in bulk_plan["pageEntities"]] == [
        "character:hotel.png",
        "character:india.png",
        "character:juliet.png",
        "character:kilo.png",
        "character:lima.png",
    ]
    assert bulk_plan["paginationLabel"] == "6-10 / 10"

    clamped_bulk_after_snapshot = create_character_list_entity_snapshot(
        [
            {"type": "character", "id": 0, "item": {"avatar": "alpha.png"}},
            {"type": "character", "id": 1, "item": {"avatar": "bravo.png"}},
            {"type": "character", "id": 2, "item": {"avatar": "charlie.png"}},
            {"type": "character", "id": 3, "item": {"avatar": "delta.png"}},
            {"type": "character", "id": 4, "item": {"avatar": "echo.png"}},
            {"type": "character", "id": 5, "item": {"avatar": "foxtrot.png"}},
            {"type": "character", "id": 6, "item": {"avatar": "golf.png"}},
            {"type": "character", "id": 7, "item": {"avatar": "hotel.png"}},
        ]
    )
    clamped_bulk_plan = create_character_bulk_delete_page_plan(
        clamped_bulk_after_snapshot,
        ["india.png", "juliet.png", "kilo.png"],
        current_page=3,
        page_size=5,
    )
    assert clamped_bulk_plan["currentPage"] == 2
    assert [entity["renderKey"] for entity in clamped_bulk_plan["pageEntities"]] == [
        "character:foxtrot.png",
        "character:golf.png",
        "character:hotel.png",
    ]
    assert clamped_bulk_plan["paginationLabel"] == "6-8 / 8"
    assert create_character_bulk_delete_page_plan(
        clamped_bulk_after_snapshot,
        [],
        current_page=1,
        page_size=5,
    ) == {"mode": "fallback", "reason": "no-deleted-avatars"}
    assert create_character_bulk_delete_page_plan(
        duplicate_snapshot,
        ["bravo.png"],
        current_page=1,
        page_size=5,
    ) == {"mode": "fallback", "reason": "duplicate-entity-key"}

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
        locale="en",
    )
    assert selected_count.text_content == "2 sel"
    assert selected_count.get_attribute("title") == "2 characters selected"
    assert selected_count.get_attribute("aria-label") == "2 characters selected"
    assert delete_button.get_attribute("aria-disabled") == "false"
    assert get_bulk_selection_short_count_text(3, "zh-cn") == "3个"

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
