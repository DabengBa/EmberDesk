"""Sandbox proof for workspace_composition_root_processing_flow.md.

Run with:
    uv run python .docs/logic-description/workspace_composition_root_sandbox_proof.py
"""


APP_INITIALIZED = "APP_INITIALIZED"
APP_READY = "APP_READY"


def collect_forbidden_reverse_imports(records, forbidden_names):
    return [
        record
        for record in records
        if record["specifier"].endswith("script.js")
        and any(name in record["names"] for name in forbidden_names)
    ]


class FakeRequestContext:
    def __init__(self, token="csrf-token", fail=False):
        self.token = token
        self.fail = fail

    def load_csrf_token(self, events):
        events.append("csrfToken:start")
        if self.fail:
            raise RuntimeError("csrf unavailable")
        events.append("csrfToken:loaded")


class FakePublicApi:
    def __init__(self):
        self.value = None

    def install(self, libs, get_context, events):
        events.append("publicApi:install")
        self.value = {"libs": libs, "getContext": get_context}


def bootstrap_workspace(request_context):
    events = []
    request_context.load_csrf_token(events)
    events.extend(
        [
            "bootstrapUi",
            "initSecrets",
            "readSecretState",
            "initLocales",
            "registerCoreModules",
            "initExtensions",
            "initPresetManager",
            "initSystemMessages",
            "getSettings",
            "getUserAvatars",
            "getCharacters",
            "initTokenizers",
            "hydrateFeatureModules",
            "initScrapers",
            "lateFeatureInit",
            APP_INITIALIZED,
            "hideInitLoader",
            "fixViewport",
            "mountReactWorkspaceShellChrome",
            APP_READY,
            "queueDeferredStartupTasks",
        ],
    )
    return events


def test_direct_owner_contract():
    direct_imports = {
        ("public/script.js", "public/scripts/events.js", ("eventSource", "event_types")),
        ("public/script.js", "public/scripts/request-context.js", ("getRequestHeaders",)),
        ("public/script.js", "public/scripts/public-api.js", ("installPublicBrowserApi",)),
    }
    assert ("public/script.js", "public/scripts/events.js", ("eventSource", "event_types")) in direct_imports
    assert ("public/script.js", "public/scripts/request-context.js", ("getRequestHeaders",)) in direct_imports
    assert ("public/script.js", "public/scripts/public-api.js", ("installPublicBrowserApi",)) in direct_imports


def test_forbidden_reverse_imports_are_detected():
    records = [
        {"file": "events.js", "specifier": "../events.js", "names": ["eventSource"]},
        {"file": "legacy.js", "specifier": "../script.js", "names": ["chat"]},
        {"file": "new-module.js", "specifier": "../script.js", "names": ["getRequestHeaders"]},
    ]
    assert collect_forbidden_reverse_imports(records, {"eventSource", "event_types", "getRequestHeaders"}) == [
        records[2],
    ]


def test_bootstrap_order_and_success_events():
    events = bootstrap_workspace(FakeRequestContext())
    assert events.index("csrfToken:loaded") < events.index("bootstrapUi")
    assert events.index(APP_INITIALIZED) < events.index("hideInitLoader")
    assert events.index("mountReactWorkspaceShellChrome") < events.index(APP_READY)
    assert events.index(APP_READY) < events.index("queueDeferredStartupTasks")


def test_public_api_is_explicit():
    api = FakePublicApi()
    assert api.value is None
    events = []
    api.install({"jquery": "library"}, "getContext", events)
    assert api.value == {"libs": {"jquery": "library"}, "getContext": "getContext"}
    assert events == ["publicApi:install"]


def test_csrf_failure_propagates_before_ready():
    try:
        bootstrap_workspace(FakeRequestContext(fail=True))
    except RuntimeError as error:
        assert str(error) == "csrf unavailable"
    else:
        raise AssertionError("CSRF failure did not propagate")


def main():
    test_direct_owner_contract()
    test_forbidden_reverse_imports_are_detected()
    test_bootstrap_order_and_success_events()
    test_public_api_is_explicit()
    test_csrf_failure_propagates_before_ready()


if __name__ == "__main__":
    main()
