# World Info Shell Context

## Module Responsibility

`public/scripts/world-info-shell-context.js` owns the narrow runtime context that lets `public/scripts/world-info.js` remain the World Info compatibility facade without importing `../script.js` directly.

The module is internal to the browser workspace. It is not a public extension API and it does not replace the user-facing World Info behavior documented in [World Info Panel](../db/features/world-info-panel.md).

## Architecture And Constraints

- `public/script.js` registers the shell context during browser module startup with `registerWorldInfoShellContext(...)`.
- `public/scripts/world-info.js` calls `requireWorldInfoShellContext()` or the event-source helper when it needs shell-owned state, events, settings, character helpers, or metadata.
- Registration must avoid eager reads of shell constants that are declared later in `public/script.js`. Values that can be affected by module initialization order use callable accessors, such as `get extensionPromptRoles() { return extension_prompt_roles; }`.
- The context fails closed when missing. World Info code should receive `World Info shell context is not registered.` instead of silently falling back to stale globals.
- The context must preserve the existing `eventSource` contract. Function-valued properties read through the World Info proxy are bound back to the underlying emitter so calls such as `eventSource.on(...)` and `eventSource.emit(...)` keep the emitter `this`.

## Core Implementation

Current binding points:

- `public/scripts/world-info-shell-context.js` stores, requires, clears, and reads event-source properties from the registered shell context.
- `public/script.js` registers settings, request-header, chat metadata, character, event, extension-prompt-role, save, and selection capabilities for World Info.
- `public/scripts/world-info.js` keeps the compatibility facade and proxies shell-owned data through the registered context.
- `tests/world-info-shell-context.test.js` proves the fail-closed missing-context rule, the direct-import removal from `world-info.js`, lazy `extensionPromptRoles` registration, and event-source method binding.

The context deliberately does not own World Info import, prompt activation, regex placement, delete cascade, token budgeting, or storage semantics. Those remain in `public/scripts/world-info.js` and adjacent World Info modules.

## Related Semantic IDs And Code Binding Points

Semantic IDs:

- `feature.startup_bootstrap`
- `feature.world_info_panel`
- `feature.character_library_panel`
- `page.chat_workspace`

Code binding points:

- `public/script.js`
- `public/scripts/world-info-shell-context.js`
- `public/scripts/world-info.js`
- `public/lib/eventemitter.js`
- `tests/world-info-shell-context.test.js`

Related docs:

- [React Modernization Roadmap](react-modernization-roadmap.md)
- [Third-Party Extension Compatibility](third-party-extension-compatibility.md)
- [World Info Shell Context Processing Flow](../logic-description/world_info_shell_context_processing_flow.md)

## Validation

Focused proof:

```bash
bun run --cwd tests test:unit -- world-info-shell-context.test.js --runInBand
uv run python .docs/logic-description/world_info_shell_context_sandbox_proof.py
```

Browser proof for startup and drawer interaction should verify that the workspace leaves global `Initializing...`, then that opening World Info while Character Management is locked leaves both panels visible.
