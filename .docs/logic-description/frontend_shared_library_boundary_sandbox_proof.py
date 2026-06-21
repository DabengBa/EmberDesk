"""Sandbox proof for frontend_shared_library_boundary_processing_flow.md.

Run with:
    uv run python .docs/logic-description/frontend_shared_library_boundary_sandbox_proof.py
"""


def marker(name):
    def _inner():
        return name

    return _inner


def resolve_slide_toggle(namespace):
    def nested_toggle(key):
        value = namespace.get(key)
        if isinstance(value, dict):
            return value.get("toggle")
        return None

    return (
        namespace.get("toggle")
        or nested_toggle("default")
        or nested_toggle("slidetoggle")
        or nested_toggle("module.exports")
    )


def install_legacy_global(window, name, value):
    if name not in window:
        window[name] = value


def main():
    bundled_toggle = marker("bundled-output")
    default_toggle = marker("default")
    legacy_toggle = marker("legacy")
    module_exports_toggle = marker("module.exports")

    assert resolve_slide_toggle({"toggle": bundled_toggle}) is bundled_toggle
    assert resolve_slide_toggle({"default": {"toggle": default_toggle}}) is default_toggle
    assert resolve_slide_toggle({"slidetoggle": {"toggle": legacy_toggle}}) is legacy_toggle
    assert resolve_slide_toggle({"module.exports": {"toggle": module_exports_toggle}}) is module_exports_toggle

    assert resolve_slide_toggle({
        "toggle": bundled_toggle,
        "default": {"toggle": default_toggle},
    }) is bundled_toggle

    assert resolve_slide_toggle({}) is None

    window = {"DOMPurify": "extension-owned"}
    install_legacy_global(window, "DOMPurify", "emberdesk-owned")
    install_legacy_global(window, "Fuse", "emberdesk-fuse")

    assert window["DOMPurify"] == "extension-owned"
    assert window["Fuse"] == "emberdesk-fuse"


if __name__ == "__main__":
    main()
