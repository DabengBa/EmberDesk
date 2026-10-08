"""Sandbox proof for react_settings_payload_processing_flow.md.

Run with:
    uv run python .docs/logic-description/react_settings_payload_sandbox_proof.py
"""

import copy
import json


DEFAULT_FORM_VALUES = {
    "providers": {
        "customUrl": "",
    },
    "advanced": {
        "autoSwipeBlacklist": "",
    },
}

FIELD_BINDINGS = [
    {
        "formPath": "providers.customUrl",
        "settingsPath": "oai_settings.custom_url",
    },
    {
        "formPath": "advanced.autoSwipeBlacklist",
        "settingsPath": "power_user.auto_swipe_blacklist",
        "toForm": "blacklist",
        "toSettings": "blacklist",
    },
]

# Generation defaults (sampling, reasoning, continue, prompt formats) are
# legacy-owned by the AI Response Configuration drawer. They are unbound: the
# React form never reads or writes them, so a save preserves them untouched.


def get_value_at_path(source, path, fallback=None):
    current = source
    for segment in path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return fallback
        current = current[segment]
    return fallback if current is None else current


def set_value_at_path(target, path, value):
    current = target
    segments = path.split(".")
    for segment in segments[:-1]:
        current = current.setdefault(segment, {})
    current[segments[-1]] = value


def parse_settings_payload(payload):
    raw = payload.get("settings") if isinstance(payload.get("settings"), str) else "{}"
    try:
        settings = json.loads(raw)
    except json.JSONDecodeError:
        settings = {}
    return {"rawSettings": raw, "settings": settings, "payload": payload}


def parse_blacklist_to_form_value(value):
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    return value if isinstance(value, str) else ""


def parse_blacklist_to_settings_value(value):
    text = "" if value is None else str(value)
    return [
        item.strip()
        for chunk in text.split("\n")
        for item in chunk.split(",")
        if item.strip()
    ]


def to_form_value(binding, current_value, settings):
    transform = binding.get("toForm")
    if transform == "blacklist":
        return parse_blacklist_to_form_value(current_value)
    return current_value


def to_settings_value(binding, form_value, form_values, base_settings):
    transform = binding.get("toSettings")
    if transform == "blacklist":
        return parse_blacklist_to_settings_value(form_value)
    return form_value


def build_settings_form_defaults(settings):
    defaults = copy.deepcopy(DEFAULT_FORM_VALUES)
    for binding in FIELD_BINDINGS:
        current_value = get_value_at_path(settings, binding["settingsPath"])
        if current_value is None and not binding.get("toFormWhenMissing"):
            continue
        next_value = to_form_value(binding, current_value, settings)
        set_value_at_path(defaults, binding["formPath"], next_value)
    return defaults


def build_settings_save_payload(base_settings, form_values):
    next_settings = copy.deepcopy(
        base_settings if isinstance(base_settings, dict) else {}
    )
    for binding in FIELD_BINDINGS:
        form_value = get_value_at_path(form_values, binding["formPath"])
        if form_value is None and not binding.get("toSettings"):
            continue
        next_value = to_settings_value(binding, form_value, form_values, base_settings)
        if next_value is None:
            continue
        set_value_at_path(next_settings, binding["settingsPath"], next_value)

    # Retired provider contract: single source normalizes on save.
    oai_settings = next_settings.get("oai_settings")
    if isinstance(oai_settings, dict):
        oai_settings["chat_completion_source"] = "openai"
    return next_settings


def main():
    invalid = parse_settings_payload({"settings": "not json"})
    assert invalid["settings"] == {}
    assert build_settings_form_defaults(invalid["settings"])["providers"]["customUrl"] == ""

    parsed = parse_settings_payload(
        {
            "settings": json.dumps(
                {
                    "untouched": {"keep": True},
                    "oai_settings": {
                        "chat_completion_source": "vertexai",
                        "google_model": "gemini-2.5-pro",
                        "reasoning_effort": "minimal",
                        "custom_url": "https://custom.example.com/v1",
                    },
                    "power_user": {
                        "auto_swipe_blacklist": ["skip", "retry"],
                    },
                }
            ),
        }
    )

    defaults = build_settings_form_defaults(parsed["settings"])
    assert "general" not in defaults
    assert defaults["providers"]["customUrl"] == "https://custom.example.com/v1"
    assert defaults["advanced"]["autoSwipeBlacklist"] == "skip, retry"

    preserved = build_settings_save_payload(parsed["settings"], defaults)
    assert preserved["untouched"]["keep"] is True
    assert preserved["oai_settings"]["chat_completion_source"] == "openai"
    # Unbound legacy-owned generation fields pass through untouched.
    assert preserved["oai_settings"]["reasoning_effort"] == "minimal"
    assert preserved["oai_settings"]["google_model"] == "gemini-2.5-pro"
    assert preserved["power_user"]["auto_swipe_blacklist"] == ["skip", "retry"]

    edited_form = copy.deepcopy(defaults)
    edited_form["advanced"]["autoSwipeBlacklist"] = "alpha, beta\n gamma"
    edited = build_settings_save_payload(parsed["settings"], edited_form)
    assert edited["oai_settings"]["chat_completion_source"] == "openai"
    assert edited["power_user"]["auto_swipe_blacklist"] == ["alpha", "beta", "gamma"]

    # A partial form carrying a changed provider field still cannot drop or
    # rewrite unbound legacy-owned values.
    sparse = build_settings_save_payload(
        {"oai_settings": {"reasoning_effort": "xhigh", "temp_openai": 0.7}},
        {"providers": {"customUrl": "https://new.example.com/v1"}},
    )
    assert sparse["oai_settings"]["custom_url"] == "https://new.example.com/v1"
    assert sparse["oai_settings"]["reasoning_effort"] == "xhigh"
    assert sparse["oai_settings"]["temp_openai"] == 0.7


if __name__ == "__main__":
    main()
