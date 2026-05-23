# Frontend Shared Library Boundary

## Goal

Stabilize the browser shared-library boundary before any large jQuery/global-script cleanup. The first frontend upgrade step clarifies what `public/lib.js` exports as modules, what it still exposes on `window`, and what extension compatibility guarantees remain.

## Production-Ready Result

This task is shippable when `/lib.js` continues to load, legacy extensions still receive the expected globals, new code can import documented module exports, and no page-level behavior changes are introduced.

## Source Evidence

- `public/lib.js` imports shared browser libraries, exports them as ES module values, and installs selected legacy globals through `initLibraryShims()`.
- `webpack.config.js` builds only `public/lib.js`, enables filesystem cache, and outputs `libraryTarget: 'module'`.
- `public/scripts/` remains jQuery-style ES module code with some global compatibility surfaces.
- Existing extension scripts may rely on `window.Fuse`, `window.DOMPurify`, `window.hljs`, `window.localforage`, `window.Handlebars`, `window.diff_match_patch`, `window.SVGInject`, `window.showdown`, `window.moment`, `window.Popper`, and `window.droll`.

## Scope

In scope:

- Document the supported `/lib.js` export and global shim contract.
- Add a small runtime or unit test that verifies the shim names remain present after initialization.
- Add a dependency boundary note for extension authors and internal modules.
- Remove duplicate or dead shared-library exposure only when no code or extension contract depends on it.
- Keep Webpack as the bundler for this step.

Out of scope:

- Replacing Webpack.
- Migrating page scripts away from jQuery.
- Removing legacy extension globals without a deprecation cycle.
- Introducing React, Vue, Svelte, or TypeScript application code.

## Implementation Plan

1. Inventory `public/lib.js` imports, default export keys, named exports, and `window` shims.
2. Search internal code for direct global library reads and convert only obvious internal reads to module imports if this can be done without behavior changes.
3. Add or update a test that runs `initLibraryShims()` in a browser-like environment and asserts the compatibility globals.
4. Add a concise tech doc describing `/lib.js` as the compatibility boundary.
5. Run Webpack build path through server startup or the existing build hook.
6. Run unit tests and a browser smoke path that loads the main shell.

## Acceptance Criteria

- `/lib.js` still builds and loads as an output module.
- All documented legacy globals remain available after shim initialization.
- Module exports remain stable for new extension code.
- No user-visible UI or workflow changes are included.

## Rollback

Revert the boundary documentation and tests plus any internal import cleanup. Because no page behavior should change, rollback is low risk.

## Risks And Boundaries

- Extension compatibility is partly implicit; removing globals without telemetry or a deprecation note is not allowed in this step.
- Webpack output path depends on `globalThis.DATA_ROOT` in non-dist mode, so tests must run through a realistic startup path or force dist intentionally.
- This step should reduce ambiguity, not start the page-by-page frontend migration.

