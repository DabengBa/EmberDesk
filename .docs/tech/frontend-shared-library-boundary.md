# Frontend Shared Library Boundary

## Module Responsibility

This document covers EmberDesk's browser shared-library boundary at `public/lib.js`. The file is the compatibility layer between modern ES module imports and legacy extension globals. It is distinct from the Workspace Composition Root at `public/script.js`: `/lib.js` owns shared dependency exports and library shims, while `script.js` owns workspace assembly, extracted runtime-contract installation, and the public `/script.js` compatibility entry.

Primary files:

- `public/lib.js` - shared browser-library entrypoint and legacy shim installer
- `vite.config.ts` - Vite library-mode build for `/lib.js`
- `src/middleware/vite-lib-serve.js` - Vite-built `/lib.js` serving middleware
- `tests/frontend-shared-library-boundary.test.js` - regression proof for exports, shims, and built output
- `public/script.js` - separate workspace composition root; it calls `initLibraryShims()` during `bootstrapWorkspace()` but does not own the library export resolver

## Architecture And Constraints

`public/lib.js` exposes two deliberate surfaces:

1. **Module surface** - first-party browser modules and new extension code should import named exports from `/lib.js` or a stable relative path to `lib.js`.
2. **Legacy global surface** - `initLibraryShims()` installs selected `window.*` names for old extensions that still read shared libraries from the global object.

Browser ES modules do not automatically leak imported names to `window`. Any global exposed by this boundary must be installed intentionally by `initLibraryShims()` and covered by tests.

**Build Tool:** Vite 8 builds the ES module output at `dist/lib/lib.js`.

The same source file is also imported directly by Node/Jest tests. Dependency export interop therefore has to work in multiple environments:

- Vite's browser module build (ES module output)
- Node's direct source import path, where a CommonJS package can appear under `default`, `slidetoggle`, or `module.exports`.

This dual boundary is intentional and recorded in [ADR-0006](../adr/0006-preserve-dual-libjs-source-and-bundled-boundary.md).

## Module Export Contract

The default export object and named exports are expected to expose the same keys:

- `lodash`
- `Fuse`
- `DOMPurify`
- `hljs`
- `localforage`
- `Handlebars`
- `css`
- `Bowser`
- `DiffMatchPatch`
- `Readability`
- `isProbablyReaderable`
- `SVGInject`
- `showdown`
- `moment`
- `seedrandom`
- `Popper`
- `droll`
- `morphdom`
- `slideToggle`
- `chalk`
- `yaml`
- `chevrotain`
- `gzipSync`
- `gzip`
- `sha256`

First-party modules should prefer explicit imports:

```javascript
import { DOMPurify, Fuse, gzip } from '../lib.js';
```

Use absolute `/lib.js` imports only where the existing module location already follows that style or where relative paths would be brittle.

### `slideToggle` interop rule

`slideToggle` is exported as a named value and as `default.slideToggle`. It currently resolves from the imported `slidetoggle` namespace in this order:

1. `toggle`
2. `default.toggle`
3. `slidetoggle.toggle`
4. `module.exports.toggle`

Fallback containers are read with `Reflect.get()` so browser bundled-output validation does not treat Node-only CommonJS fallback names as required static exports. The documented boundary is that source imports and Vite-built `/lib.js` expose a callable `slideToggle` function.

## Legacy Global Shim Contract

`initLibraryShims()` installs the following globals when they are absent:

- `window.Fuse`
- `window.DOMPurify`
- `window.hljs`
- `window.localforage`
- `window.Handlebars`
- `window.diff_match_patch`
- `window.SVGInject`
- `window.showdown`
- `window.moment`
- `window.Popper`
- `window.droll`

The shim is idempotent and must not overwrite an existing value. This protects extensions that pre-seed or wrap a shared global before EmberDesk startup completes.

The workspace composition root installs other browser contracts separately. `globalThis.SillyTavern` is installed explicitly by `installPublicBrowserApi()` from `public/scripts/public-api.js`; `eventSource` / `event_types` are owned by `public/scripts/events.js`; and CSRF/request headers are owned by `public/scripts/request-context.js`. These are related compatibility surfaces, not additional `/lib.js` exports.

## Extension Guidance

New extension code should import from `/lib.js` when it is authored as an ES module. Legacy extensions may continue to read the documented `window.*` globals.

Do not add new global shims for convenience. A new global requires:

- a compatibility reason,
- a documented entry in this file,
- focused coverage in `tests/frontend-shared-library-boundary.test.js`.

Removing a global requires a deprecation cycle and extension-facing migration notes. It is not allowed as incidental cleanup.

## Validation

Focused boundary proof:

```bash
pnpm --dir tests run test:unit -- frontend-shared-library-boundary.test.js --runInBand
```

Touched-file lint:

```bash
pnpm exec eslint public/lib.js tests/frontend-shared-library-boundary.test.js
```

Logic-description proof:

```bash
uv run python .docs/logic-description/frontend_shared_library_boundary_sandbox_proof.py
```

Docs check:

```bash
pnpm run docs:check
```

## Related Semantic IDs And Code Binding Points

This boundary supports the browser shell and extension surfaces described by:

- `page.chat_workspace`
- `feature.extension_panel_open`
- `term.shared_browser_library`

Stability-sensitive binding points:

- `initLibraryShims()` in `public/lib.js`
- `initLibraryShims()` call during `public/script.js` startup
- `installPublicBrowserApi()` call during `public/script.js` module composition
- `public/scripts/events.js` and `public/scripts/request-context.js` as separate extracted contract owners
- `slideToggle` resolver in `public/lib.js`
- Vite library config in `vite.config.ts`
- `getViteLibServeMiddleware()` in `src/middleware/vite-lib-serve.js`

Current processing rules are documented in [Frontend Shared Library Boundary Processing Flow](../logic-description/frontend_shared_library_boundary_processing_flow.md).

The surrounding workspace composition and startup order are documented in [Workspace Composition Root](workspace-composition-root.md) and [Workspace Composition Root Processing Flow](../logic-description/workspace_composition_root_processing_flow.md).
