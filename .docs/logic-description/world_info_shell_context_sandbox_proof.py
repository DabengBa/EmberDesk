"""Sandbox proof for world_info_shell_context_processing_flow.md.

Run with:
    uv run python .docs/logic-description/world_info_shell_context_sandbox_proof.py
"""


class MissingWorldInfoShellContext(RuntimeError):
    pass


class ShellContextRegistry:
    def __init__(self):
        self.context = None

    def register(self, context):
        self.context = context

    def require(self):
        if self.context is None:
            raise MissingWorldInfoShellContext("World Info shell context is not registered.")
        return self.context

    def get_event_source_property(self, property_name):
        source = self.require()["eventSource"]
        value = getattr(source, property_name)
        if callable(value):
            return lambda *args, **kwargs: value(*args, **kwargs)
        return value


class LazyShellContext:
    def __init__(self, event_source, role_reader):
        self.eventSource = event_source
        self._role_reader = role_reader

    @property
    def extensionPromptRoles(self):
        return self._role_reader()

    def __getitem__(self, key):
        return getattr(self, key)


class EventSource:
    version = "shell-emitter"

    def __init__(self):
        self.calls = []

    def on(self, event_name, listener):
        self.calls.append({"event": event_name, "listener": listener, "self": self})
        return self


def test_missing_context_fails_closed():
    registry = ShellContextRegistry()
    try:
        registry.require()
    except MissingWorldInfoShellContext as error:
        assert str(error) == "World Info shell context is not registered."
    else:
        raise AssertionError("missing context did not fail closed")


def test_extension_prompt_roles_are_lazy():
    roles = None
    registry = ShellContextRegistry()
    context = LazyShellContext(EventSource(), lambda: roles)

    registry.register(context)
    roles = {"SYSTEM": 0, "USER": 1, "ASSISTANT": 2}

    assert registry.require().extensionPromptRoles == roles


def test_event_source_non_function_values_passthrough():
    registry = ShellContextRegistry()
    event_source = EventSource()
    registry.register(LazyShellContext(event_source, lambda: {}))

    assert registry.get_event_source_property("version") == "shell-emitter"


def test_event_source_methods_keep_source_binding():
    registry = ShellContextRegistry()
    event_source = EventSource()
    registry.register(LazyShellContext(event_source, lambda: {}))

    listener = object()
    on = registry.get_event_source_property("on")
    result = on("chat_changed", listener)

    assert result is event_source
    assert event_source.calls == [
        {"event": "chat_changed", "listener": listener, "self": event_source},
    ]


def main():
    test_missing_context_fails_closed()
    test_extension_prompt_roles_are_lazy()
    test_event_source_non_function_values_passthrough()
    test_event_source_methods_keep_source_binding()


if __name__ == "__main__":
    main()
