"""Sandbox proof for react_settings_payload_processing_flow.md.

Run with:
    uv run python .docs/logic-description/react_settings_payload_sandbox_proof.py
"""

import copy
import json


DEFAULT_FORM_VALUES = {
    "general": {
        "reasoningEffort": "high",
    },
    "providers": {
        "chatCompletionSource": "openai",
        "useVertexAi": False,
    },
    "advanced": {
        "autoSwipeBlacklist": "",
    },
}

FIELD_BINDINGS = [
    {
        "formPath": "general.reasoningEffort",
        "settingsPath": "oai_settings.reasoning_effort",
    },
    {
        "formPath": "providers.chatCompletionSource",
        "settingsPath": "oai_settings.chat_completion_source",
        "toForm": "chat_completion_source",
        "toSettings": "chat_completion_source",
    },
    {
        "formPath": "providers.useVertexAi",
        "settingsPath": "oai_settings.use_vertexai",
        "toForm": "use_vertex_ai",
        "toFormWhenMissing": True,
    },
    {
        "formPath": "advanced.autoSwipeBlacklist",
        "settingsPath": "power_user.auto_swipe_blacklist",
        "toForm": "blacklist",
        "toSettings": "blacklist",
    },
]

REASONING_EFFORT_OPTIONS = {
    "auto",
    "low",
    "medium",
    "high",
    "min",
    "max",
    "none",
    "minimal",
    "xhigh",
}


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
    if transform == "chat_completion_source":
        return "makersuite" if current_value == "vertexai" else current_value
    if transform == "use_vertex_ai":
        if get_value_at_path(settings, "oai_settings.chat_completion_source") == "vertexai":
            return True
        return current_value
    if transform == "blacklist":
        return parse_blacklist_to_form_value(current_value)
    return current_value


def to_settings_value(binding, form_value, form_values, base_settings):
    transform = binding.get("toSettings")
    if transform == "chat_completion_source":
        base_source = get_value_at_path(base_settings, "oai_settings.chat_completion_source")
        uses_vertex_ai = get_value_at_path(form_values, "providers.useVertexAi") is True
        if base_source == "vertexai" and form_value == "makersuite" and uses_vertex_ai:
            return "vertexai"
        return form_value
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
    next_settings = copy.deepcopy(base_settings if isinstance(base_settings, dict) else {})
    for binding in FIELD_BINDINGS:
        form_value = get_value_at_path(form_values, binding["formPath"])
        next_value = to_settings_value(binding, form_value, form_values, base_settings)
        set_value_at_path(next_settings, binding["settingsPath"], next_value)
    return next_settings


def main():
    invalid = parse_settings_payload({"settings": "not json"})
    assert invalid["settings"] == {}
    assert build_settings_form_defaults(invalid["settings"])["general"]["reasoningEffort"] == "high"

    parsed = parse_settings_payload({
        "settings": json.dumps({
            "untouched": {"keep": True},
            "oai_settings": {
                "chat_completion_source": "vertexai",
                "google_model": "gemini-2.5-pro",
                "reasoning_effort": "minimal",
            },
            "power_user": {
                "auto_swipe_blacklist": ["skip", "retry"],
            },
        }),
    })

    defaults = build_settings_form_defaults(parsed["settings"])
    assert defaults["providers"]["chatCompletionSource"] == "makersuite"
    assert defaults["providers"]["useVertexAi"] is True
    assert defaults["general"]["reasoningEffort"] == "minimal"
    assert defaults["general"]["reasoningEffort"] in REASONING_EFFORT_OPTIONS
    assert defaults["advanced"]["autoSwipeBlacklist"] == "skip, retry"

    preserved = build_settings_save_payload(parsed["settings"], defaults)
    assert preserved["untouched"]["keep"] is True
    assert preserved["oai_settings"]["chat_completion_source"] == "vertexai"
    assert preserved["oai_settings"]["use_vertexai"] is True
    assert preserved["oai_settings"]["reasoning_effort"] == "minimal"
    assert preserved["power_user"]["auto_swipe_blacklist"] == ["skip", "retry"]

    downgraded_form = copy.deepcopy(defaults)
    downgraded_form["providers"]["useVertexAi"] = False
    downgraded_form["advanced"]["autoSwipeBlacklist"] = "alpha, beta\n gamma"
    downgraded = build_settings_save_payload(parsed["settings"], downgraded_form)
    assert downgraded["oai_settings"]["chat_completion_source"] == "makersuite"
    assert downgraded["oai_settings"]["use_vertexai"] is False
    assert downgraded["power_user"]["auto_swipe_blacklist"] == ["alpha", "beta", "gamma"]

    new_google = build_settings_save_payload(
        {"oai_settings": {"chat_completion_source": "openai"}},
        {
            "general": {"reasoningEffort": "xhigh"},
            "providers": {"chatCompletionSource": "makersuite", "useVertexAi": True},
            "advanced": {"autoSwipeBlacklist": ""},
        },
    )
    assert new_google["oai_settings"]["chat_completion_source"] == "makersuite"
    assert new_google["oai_settings"]["reasoning_effort"] == "xhigh"
    assert new_google["power_user"]["auto_swipe_blacklist"] == []


if __name__ == "__main__":
    main()
