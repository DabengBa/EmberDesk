---
id: term.shared_browser_library
type: term
name: Shared Browser Library
related: [page.chat_workspace]
---

# Term: Shared Browser Library

## ID 解释

`term.shared_browser_library` represents the product-visible idea that EmberDesk exposes a stable browser-side library surface for first-party modules. It describes the product concept, not the internal machinery that provides it.

## Definition

The shared browser library is the import surface that lets browser modules reuse common capabilities such as sanitization, fuzzy search, compression, markdown rendering, and selected compatibility helpers from one documented place.

## Compatibility Commitment

- The shared browser library is a long-term supported import surface for first-party browser code.
- Legacy global names are compatibility affordances, not a growth path for adding new globals. Their supported behavior must be deliberately preserved before the supplying legacy runtime is removed.
- The workspace keeps its public browser contracts stable while internal areas are modernized incrementally.
- The product-facing promise here is only that the shared browser utility surface remains stable.

## User-Facing Lifecycle

1. The workspace loads the shared library during normal startup.
2. First-party browser modules use named utilities from the library.
3. First-party browser modules use the shared library instead of carrying their own copies of common capabilities.

## UI-Relevant Boundaries

- A stable shared library keeps workspace behavior consistent as the main workspace is modernized incrementally.
- Legacy global names are compatibility affordances, not a signal that every library should become a global.
- The shared library supports the workspace surfaces; it is not a separate page or an end-user settings feature.
- Modernization work must not redefine the shared library contract.

## Related Surfaces

- [Chat Workspace](page.chat_workspace) is the browser surface that loads the shared library.
- First-party panels are the consumers of stable shared browser utilities.
