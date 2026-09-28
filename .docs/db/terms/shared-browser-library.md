---
id: term.shared_browser_library
type: term
name: Shared Browser Library
related: [page.chat_workspace, feature.extension_panel_open]
---

# Term: Shared Browser Library

## ID 解释

`term.shared_browser_library` represents the product-visible idea that EmberDesk exposes a stable browser-side library surface for first-party modules. It does not describe the bundler, package-resolution internals, server middleware, or workspace composition-root implementation that produces and installs that surface.

## Definition

The shared browser library is the import surface that lets browser modules reuse common dependencies such as sanitization, fuzzy search, compression, markdown rendering, and selected compatibility helpers from one documented place.

## Final Compatibility Status

- Retirement packages use the provider-neutral contract in `tests/helpers/frontend-compatibility-contract.js` (`aliases` / `globals` families) with `pnpm run test:compat` before deleting a shared-library provider.

- `/lib.js` is a long-term supported browser-module surface for first-party code.
- Legacy `window.*` shims are current compatibility affordances, not a growth path for adding new globals. Their supported behavior must be deliberately reimplemented before the supplying legacy runtime is removed.
- Third-party extension ecosystems and `@sillytavern/*` aliases are retired; `/lib.js` is the single shared import surface for first-party browser modules.
- The workspace keeps its public browser contracts stable while internal owners are modernized incrementally. Detailed composition-root ownership and reverse-import rules live in [Workspace Composition Root](../../tech/workspace-composition-root.md).
- Maintainer closeout state for `/lib.js`, legacy globals, and `@sillytavern/*` aliases lives in tech docs and ADRs. The product-facing promise here is only that the shared browser utility surface remains stable.

## User-Facing Lifecycle

1. The workspace loads the shared library during normal startup.
2. First-party browser modules import named utilities from the library.
3. First-party browser modules import from `/lib.js` instead of bundling their own copies of common dependencies.

## UI-Relevant Boundaries

- A stable shared library reduces import churn when the main workspace is modernized incrementally.
- React sole-owner panel hosts can modernize surrounding workspace UI while shared imports and globals remain stable.
- Legacy global names are compatibility affordances, not a signal that every library should become a global.
- The shared library supports the workspace surfaces; it is not a separate page or an end-user settings feature.
- Retirement and modernization work must not redefine `/lib.js` import boundaries.

## Related Surfaces

- [Chat Workspace](page.chat_workspace) is the browser surface that loads the shared library.
- [Extensions Panel Open](feature.extension_panel_open) is retired; first-party panels are the consumers of stable shared browser utilities.
