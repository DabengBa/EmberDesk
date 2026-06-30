# World Info Shell Context Processing Flow

## Metadata

- Owner: World Info browser shell-context documentation
- Current code binding:
  - `public/script.js`
  - `public/scripts/world-info-shell-context.js`
  - `public/scripts/world-info.js`
  - `public/lib/eventemitter.js`
  - `tests/world-info-shell-context.test.js`
- Related tech doc: [.docs/tech/world-info-shell-context.md](../tech/world-info-shell-context.md)
- Related semantic docs:
  - [.docs/db/features/startup-bootstrap.md](../db/features/startup-bootstrap.md)
  - [.docs/db/features/world-info-panel.md](../db/features/world-info-panel.md)
  - [.docs/db/features/character-library-panel.md](../db/features/character-library-panel.md)
  - [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md)

## Goals And Non-Goals

Goals:

- Document the current registration and read rules for the World Info shell context.
- Make startup-order safety reproducible without importing the browser workspace.
- Document how the World Info event-source proxy preserves the underlying emitter binding.
- Record the fail-closed behavior for missing shell context.

Non-goals:

- Describe World Info scanning, prompt activation, token budgeting, import conversion, or delete cascade.
- Define a public extension API.
- Replace focused browser validation for the user-visible World Info drawer.

## Input Discovery And Parsing Rules

Inputs:

- `worldInfoShellContext`: the object registered by `public/script.js`.
- `extensionPromptRolesAccessor`: the lazy `extensionPromptRoles` getter registered on the context.
- `eventSource`: the shell-owned emitter object stored in the context.
- `eventSourceProperty`: the property read by `public/scripts/world-info.js` through the World Info event-source proxy.

Missing context is invalid. The context reader throws instead of returning a partial object.

## Outputs

The processing outputs are:

- `registeredWorldInfoShellContext`: the context object currently stored for World Info.
- `requiredWorldInfoShellContext`: the stored context or a fail-closed error.
- `extensionPromptRoles`: the shell-owned role map read lazily after `public/script.js` has initialized the exported role constant.
- `eventSourcePropertyValue`: the value returned to the World Info event-source proxy.

## Staged Processing Flow

### Register shell context

1. `public/script.js` calls `registerWorldInfoShellContext(context)` during module startup.
2. Most shell capabilities are registered as functions so later calls read current shell state.
3. Shell constants that are declared later in the module, currently `extension_prompt_roles`, are exposed through a getter on the context object.
4. Registration must not directly evaluate a not-yet-initialized shell constant.

### Require shell context

1. `requireWorldInfoShellContext()` checks whether a context has been registered.
2. If no context exists, it throws `World Info shell context is not registered.`
3. If a context exists, it returns the stored object unchanged.

### Read extension prompt roles

1. `public/scripts/world-info.js` reads `getWorldInfoShell().extensionPromptRoles[property]` only when role data is needed.
2. The getter on the registered context evaluates `extension_prompt_roles` at that later read time.
3. If the workspace has initialized normally, the getter returns the role map with `SYSTEM`, `USER`, and `ASSISTANT`.
4. This avoids blocking [Workspace Startup Bootstrap](../db/features/startup-bootstrap.md) during shell-context registration.

### Read event-source properties

1. `public/scripts/world-info.js` reads event methods through `getWorldInfoShellEventSourceProperty(property)`.
2. The helper retrieves `source = requireWorldInfoShellContext().eventSource`.
3. The helper reads `value = source[property]`.
4. If `value` is a function, it returns `value.bind(source)`.
5. If `value` is not a function, it returns the value unchanged.
6. The bound function preserves the emitter `this` for `on`, `once`, `emit`, `emitAndWait`, `makeFirst`, `makeLast`, and `removeListener`.

## Key Rules

- Context registration is an internal browser-workspace seam; it is not user configuration and not an extension API.
- Missing context fails closed.
- Shell constants that might be declared after registration must be lazy.
- Event-source methods must keep the original emitter as `this`; otherwise listeners and emitted events can read or mutate the wrong object.
- World Info remains the compatibility facade for World Info behavior. The shell context only supplies shell-owned dependencies.

## Output Schema

```json
{
  "registeredWorldInfoShellContext": {
    "hasEventSource": true,
    "hasExtensionPromptRolesAccessor": true
  },
  "requiredWorldInfoShellContext": {
    "ok": true
  },
  "extensionPromptRoles": {
    "SYSTEM": 0,
    "USER": 1,
    "ASSISTANT": 2
  },
  "eventSourcePropertyValue": {
    "property": "on",
    "boundToSource": true
  }
}
```

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/world_info_shell_context_sandbox_proof.py
```

The proof script embeds fake shell contexts and an emitter that depends on `self`. It verifies missing-context failure, lazy extension-prompt-role access after registration, non-function event-source value passthrough, and bound event-source method behavior.

## Boundaries And Failure Modes

- If context registration eagerly reads a later shell constant, browser startup can fail before `app_ready` and leave the user on global `Initializing...`.
- If event-source methods are returned unbound, `eventSource.on(...)` and `eventSource.emit(...)` can run with the proxy or caller object as `this`, breaking listener storage and event dispatch.
- If the context is missing, the correct behavior is a direct fail-closed error, not a hidden fallback to `../script.js`.
- This flow does not prove the visible drawer contract by itself; browser validation must still prove that the World Info drawer opens and respects locked workspace panels.
