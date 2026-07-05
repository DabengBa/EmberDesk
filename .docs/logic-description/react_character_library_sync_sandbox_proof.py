"""Sandbox proof for react_character_library_sync_processing_flow.md.

Run with:
    uv run python .docs/logic-description/react_character_library_sync_sandbox_proof.py
"""

import json


class CharacterLibraryFetchError(Exception):
    def __init__(self, response, data):
        super().__init__(f"Failed to fetch characters: {response.status} {response.statusText}")
        self.name = "CharacterLibraryFetchError"
        self.status = response.status
        self.statusText = response.statusText
        self.data = data


class FakeResponse:
    def __init__(self, ok, status=200, statusText="OK", payload=None, json_error=None):
        self.ok = ok
        self.status = status
        self.statusText = statusText
        self.payload = payload
        self.json_error = json_error

    def json(self):
        if self.json_error is not None:
            raise self.json_error
        return self.payload


def parse_character_library_fetch_response(response):
    if response.ok:
        return response.json()

    try:
        data = response.json()
    except Exception:
        data = None

    raise CharacterLibraryFetchError(response, data)


def get_character_library_fetch_error_data(error):
    return error.data if isinstance(error, CharacterLibraryFetchError) else None


def stringify_payload(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def has_character_library_payload_changed(current_characters, next_characters):
    return stringify_payload(current_characters) != stringify_payload(next_characters)


def sync_characters_from_query(
    current_characters,
    next_characters,
    active_avatar=None,
    *,
    characters_data_updated_at=None,
    last_synced_characters_data_updated_at=None,
):
    if (
        characters_data_updated_at is not None
        and last_synced_characters_data_updated_at == characters_data_updated_at
    ):
        return {
            "deduplicated": True,
            "lastSyncedCharactersDataUpdatedAt": last_synced_characters_data_updated_at,
            "changed": False,
            "reselectedAvatar": None,
            "refreshedGroups": False,
            "reprintedCharacters": False,
        }

    next_last_synced = (
        characters_data_updated_at
        if characters_data_updated_at is not None
        else last_synced_characters_data_updated_at
    )

    if not has_character_library_payload_changed(current_characters, next_characters):
        return {
            "deduplicated": False,
            "lastSyncedCharactersDataUpdatedAt": next_last_synced,
            "changed": False,
            "reselectedAvatar": None,
            "refreshedGroups": False,
            "reprintedCharacters": False,
        }

    current_characters[:] = [dict(character) for character in next_characters]
    reselected_avatar = None
    if active_avatar and any(character.get("avatar") == active_avatar for character in current_characters):
        reselected_avatar = active_avatar

    return {
        "deduplicated": False,
        "lastSyncedCharactersDataUpdatedAt": next_last_synced,
        "changed": True,
        "reselectedAvatar": reselected_avatar,
        "refreshedGroups": True,
        "reprintedCharacters": True,
    }


def main():
    payload = [{"avatar": "alpha.png", "name": "Alpha", "tags": ["old"]}]
    ok_response = FakeResponse(True, payload=payload)
    assert parse_character_library_fetch_response(ok_response) == payload

    overflow_response = FakeResponse(
        False,
        status=413,
        statusText="Payload Too Large",
        payload={"overflow": True},
    )
    try:
        parse_character_library_fetch_response(overflow_response)
    except CharacterLibraryFetchError as error:
        assert error.status == 413
        assert error.statusText == "Payload Too Large"
        assert error.data == {"overflow": True}
        assert get_character_library_fetch_error_data(error) == {"overflow": True}
    else:
        raise AssertionError("overflow response did not raise")

    non_json_response = FakeResponse(
        False,
        status=500,
        statusText="Server Error",
        json_error=ValueError("not json"),
    )
    try:
        parse_character_library_fetch_response(non_json_response)
    except CharacterLibraryFetchError as error:
        assert error.status == 500
        assert error.data is None
    else:
        raise AssertionError("non-json failure did not raise")

    assert get_character_library_fetch_error_data(ValueError("other")) is None

    current_characters = [
        {
            "avatar": "alpha.png",
            "name": "Alpha",
            "chat": "Alpha - chat",
            "fav": False,
            "tags": ["old"],
        }
    ]
    next_characters = [
        {
            "avatar": "alpha.png",
            "name": "Alpha",
            "chat": "Alpha - chat",
            "fav": False,
            "tags": ["new"],
        }
    ]
    assert has_character_library_payload_changed(current_characters, next_characters) is True
    assert has_character_library_payload_changed(next_characters, [dict(next_characters[0])]) is False

    sync_decision = sync_characters_from_query(
        current_characters,
        next_characters,
        active_avatar="alpha.png",
        characters_data_updated_at=101,
        last_synced_characters_data_updated_at=99,
    )
    assert sync_decision == {
        "deduplicated": False,
        "lastSyncedCharactersDataUpdatedAt": 101,
        "changed": True,
        "reselectedAvatar": "alpha.png",
        "refreshedGroups": True,
        "reprintedCharacters": True,
    }
    assert current_characters == next_characters

    no_op_decision = sync_characters_from_query(
        current_characters,
        [dict(next_characters[0])],
        active_avatar="alpha.png",
        characters_data_updated_at=102,
        last_synced_characters_data_updated_at=101,
    )
    assert no_op_decision == {
        "deduplicated": False,
        "lastSyncedCharactersDataUpdatedAt": 102,
        "changed": False,
        "reselectedAvatar": None,
        "refreshedGroups": False,
        "reprintedCharacters": False,
    }

    deduplicated_decision = sync_characters_from_query(
        current_characters,
        [dict(next_characters[0])],
        active_avatar="alpha.png",
        characters_data_updated_at=102,
        last_synced_characters_data_updated_at=102,
    )
    assert deduplicated_decision == {
        "deduplicated": True,
        "lastSyncedCharactersDataUpdatedAt": 102,
        "changed": False,
        "reselectedAvatar": None,
        "refreshedGroups": False,
        "reprintedCharacters": False,
    }


if __name__ == "__main__":
    main()
