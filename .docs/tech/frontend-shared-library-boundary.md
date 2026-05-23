# Frontend Shared Library Boundary

## Module Responsibility

This document covers EmberDesk's browser shared-library boundary at `public/lib.js`. The file is the compatibility layer between modern ES module imports and legacy extension globals.

Primary files:

- `public/lib.js` - shared browser-library entrypoint and legacy shim installer
- `webpack.config.js` - Webpack module-output build for `/lib.js`
- `src/middleware/webpack-serve.js` - development/runtime serving path for generated `/lib.js`
- `tests/frontend-shared-library-boundary.test.js` - regression proof for exports, shims, and built output

## Architecture And Constraints

`public/lib.js` exposes two deliberate surfaces:

1. **Module surface** - first-party browser modules and new extension code should import named exports from `/lib.js` or a stable relative path to `lib.js`.
2. **Legacy global surface** - `initLibraryShims()` installs selected `window.*` names for old extensions that still read shared libraries from the global object.

Browser ES modules do not automatically leak imported names to `window`. Any global exposed by this boundary must be installed intentionally by `initLibraryShims()` and covered by tests.

Webpack remains the bundler for this boundary. It is currently scoped to `public/lib.js` and emits module output with `experiments.outputModule` and `libraryTarget: 'module'`.

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

## Extension Guidance

New extension code should import from `/lib.js` when it is authored as an ES module. Legacy extensions may continue to read the documented `window.*` globals.

Do not add new global shims for convenience. A new global requires:

- a compatibility reason,
- a documented entry in this file,
- focused coverage in `tests/frontend-shared-library-boundary.test.js`.

Removing a global requires a deprecation cycle and extension-facing migration notes. It is not allowed as incidental cleanup.

## Validation

Focused boundary proof:

```powershell
npm run test:unit -- frontend-shared-library-boundary.test.js --runInBand
```

Touched-file lint:

```powershell
npx eslint public/lib.js tests/frontend-shared-library-boundary.test.js
```

Docs check:

```powershell
npm run docs:check
```

## Related Semantic IDs And Code Binding Points

This boundary has no user-facing semantic ID. It supports the browser shell and extension surfaces described by:

- `page.chat_workspace`
- `feature.extension_panel_open`

Stability-sensitive binding points:

- `initLibraryShims()` in `public/lib.js`
- `initLibraryShims()` call during `public/script.js` startup
- `getPublicLibConfig()` in `webpack.config.js`
- `getWebpackServeMiddleware()` in `src/middleware/webpack-serve.js`
