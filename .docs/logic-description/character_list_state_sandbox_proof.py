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


if __name__ == "__main__":
    main()
