"""Sandbox proof for frontend_shared_library_boundary_processing_flow.md.

Run with:
    uv run python .docs/logic-description/frontend_shared_library_boundary_sandbox_proof.py
"""


def install_legacy_global(window, name, value):
    if name not in window:
        window[name] = value


def main():
    window = {"DOMPurify": "extension-owned"}
    install_legacy_global(window, "DOMPurify", "emberdesk-owned")
    install_legacy_global(window, "Fuse", "emberdesk-fuse")

    assert window["DOMPurify"] == "extension-owned"
    assert window["Fuse"] == "emberdesk-fuse"


if __name__ == "__main__":
    main()
