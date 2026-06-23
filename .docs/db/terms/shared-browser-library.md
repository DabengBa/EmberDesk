---
id: term.shared_browser_library
type: term
name: Shared Browser Library
related: [page.chat_workspace, feature.extension_panel_open]
---

# Term: Shared Browser Library

## ID 解释

`term.shared_browser_library` represents the product-visible idea that EmberDesk exposes a stable browser-side library surface for first-party modules and extension authors. It does not describe the bundler, package-resolution internals, or server middleware that produce the file.

## Definition

The shared browser library is the import surface that lets browser modules and ES-module extensions reuse common dependencies such as sanitization, fuzzy search, compression, markdown rendering, and selected compatibility helpers from one documented place.

## Final Compatibility Status

- `/lib.js` is a long-term supported browser-module surface for first-party code and new ES-module extensions.
- The legacy `window.*` shims installed from `public/lib.js` are frozen compatibility affordances, not a growth path for adding new globals.
- Existing upstream-style `@sillytavern/*` aliases remain a separate frozen compatibility facade for ecosystems such as `JS-Slash-Runner`; when an extension only needs shared utilities, `/lib.js` is the preferred new import surface.

## User-Facing Lifecycle

1. The workspace loads the shared library during normal startup.
2. First-party browser modules import named utilities from the library.
3. New ES-module extensions may import from `/lib.js` instead of bundling their own copies of common dependencies.
4. Legacy extensions can continue using the documented global names installed by the workspace startup shim.

## UI-Relevant Boundaries

- A stable shared library reduces extension breakage when the main workspace is modernized incrementally.
- Guarded React panel hosts can modernize surrounding workspace UI while extension-facing imports and globals remain stable.
- Legacy global names are compatibility affordances, not a signal that every library should become a global.
- The shared library supports the workspace and extension surfaces; it is not a separate page or an end-user settings feature.

## Related Surfaces

- [Chat Workspace](page.chat_workspace) is the browser surface that loads the shared library.
- [Extensions Panel Open](feature.extension_panel_open) is the extension-facing workspace area most likely to depend on stable shared browser utilities.
