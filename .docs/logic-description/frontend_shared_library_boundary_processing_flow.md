# Frontend Shared Library Boundary Processing Flow

## Metadata

- Owner: frontend shared-library boundary documentation
- Current code binding: `public/lib.js`

- Related tech doc: [.docs/tech/frontend-shared-library-boundary.md](../tech/frontend-shared-library-boundary.md)

## Goals And Non-Goals

Goals:

- Document the current rules that turn dependency namespace objects into the documented `/lib.js` export surface.


Non-goals:

- Re-document every dependency's API.
- Replace `tests/frontend-shared-library-boundary.test.js`.
- Describe Vite internals beyond the observable bundled-output boundary this file depends on.

## Input Discovery And Parsing Rules

The boundary receives dependency values from ES module imports in `public/lib.js`.

## Outputs

Each shared library value is exported under the same key as a named export and in the default export object. Both forms refer to the same value. Neither form publishes globals.

## Staged Processing Flow

1. Import the shared library values in `public/lib.js`.
2. Expose the same values in the named and default exports, both from source and in Vite's built `/lib.js`.


## Sandbox Verification

Run:

```bash
pnpm --dir tests run test:unit -- frontend-shared-library-boundary.test.js --runInBand
```

The focused Jest test checks the actual source and the Vite bundle.

## Boundaries And Failure Modes

- If named and default exports diverge in source or the bundle exposes the wrong keys, the focused Jest test fails.
- If the source publishes shared dependencies onto `window`, the focused Jest test fails.
