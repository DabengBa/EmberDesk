---
description: "How public/lib.js exposes shared browser dependencies through the same ES module exports in source and in the Vite build."
kind: technical
topic: frontend-shared-library-boundary
---

# Frontend Shared Library Boundary

## Module Responsibility

`public/lib.js` owns shared browser dependency exports. The separate workspace composition root at `public/script.js` assembles the workspace and installs its runtime contracts.

Primary files:

- `public/lib.js` - shared browser-library entrypoint
- `vite.config.ts` - Vite library-mode build for `/lib.js`
- `src/middleware/vite-lib-serve.ts` - Vite-built `/lib.js` serving middleware
- `tests/frontend-shared-library-boundary.test.js` - regression proof for exports and built output

## Architecture And Constraints

First-party browser modules import dependencies explicitly; `/lib.js` does not install `window.*` aliases. There is no third-party extension runtime.

**Build Tool:** Vite 8 builds the ES module output at `dist/lib/lib.js`.

The shared `hljs` instance initially registers common Markdown languages and
their embedded-language dependencies. Message code blocks with other explicit
languages or requiring autodetection load the full highlight.js registry on
demand; its original registration order is restored for autodetection. The copy
control is available while loading, remains available on failure, and is not
duplicated on a repeated visit. The named and default exports share one
instance. See `public/lib.js`,
`public/scripts/highlight-code-block.js` and `public/scripts/message-service.js`.

Vite emits its library chunks under `/highlight-chunks/`. The existing library
middleware serves only flat JavaScript filenames from that dedicated directory;
the development proxy forwards the same namespace to the backend. Other
`dist/lib` paths are not exposed by this middleware. Startup size comparisons
include `/lib.js` and its transitive static imports, excluding dynamic imports.
With Playwright Chromium installed, `pnpm run build:lib && node tests/highlight-built.integration.runner.mjs` checks the real build in a browser.

The same source file is also imported directly by Node/Jest tests. Dependency export interop therefore has to work in multiple environments:

- Vite's browser module build (ES module output)
- Node's direct source import path.

This dual boundary is intentional: `/lib.js` must preserve both source imports and bundled output.

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
- `chalk`
- `yaml`
- `chevrotain`
- `gzipSync`
- `gzip`

First-party modules should prefer explicit imports:

```javascript
import { DOMPurify, Fuse, gzip } from '../lib.js';
```

Use absolute `/lib.js` imports only where the existing module location already follows that style or where relative paths would be brittle.


## Validation

Focused boundary proof:

```bash
pnpm --dir tests run test:unit -- frontend-shared-library-boundary.test.js --runInBand
```

Touched-file lint:

```bash
pnpm exec eslint public/lib.js tests/frontend-shared-library-boundary.test.js
```


Docs check:

```bash
pnpm run docs:check
```

## Related Semantic IDs And Code Binding Points

This boundary supports the browser shell described by:

- `page.chat_workspace`

- `term.shared_browser_library`

Stability-sensitive binding points:

- Named and default exports in `public/lib.js`
- Vite library config in `vite.config.ts`
- `getViteLibServeMiddleware()` in `src/middleware/vite-lib-serve.ts`

Current processing rules are documented in [Frontend Shared Library Boundary Processing Flow](../logic-description/frontend_shared_library_boundary_processing_flow.md).

The surrounding workspace composition and startup order are documented in [Workspace Composition Root](workspace-composition-root.md) and [Workspace Composition Root Processing Flow](../logic-description/workspace_composition_root_processing_flow.md).
