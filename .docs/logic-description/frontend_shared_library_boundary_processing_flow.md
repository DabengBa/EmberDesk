# Frontend Shared Library Boundary Processing Flow

## Metadata

- Owner: frontend shared-library boundary documentation
- Current code binding: `public/lib.js`
- Related tech doc: [.docs/tech/frontend-shared-library-boundary.md](../tech/frontend-shared-library-boundary.md)
- Related ADR: [.docs/adr/0006-preserve-dual-libjs-source-and-bundled-boundary.md](../adr/0006-preserve-dual-libjs-source-and-bundled-boundary.md)

## Goals And Non-Goals

Goals:

- Document the current rules that turn dependency namespace objects into the documented `/lib.js` export surface.
- Make the `slideToggle` fallback order reproducible without importing production code.
- Record the boundary between module exports and legacy global shims.

Non-goals:

- Re-document every dependency's API.
- Replace `tests/frontend-shared-library-boundary.test.js`.
- Describe Webpack internals beyond the observable boundary this file depends on.

## Input Discovery And Parsing Rules

The boundary receives dependency values from ES module imports in `public/lib.js`.

For most dependencies, the imported value is exported directly. `slidetoggle` is special because direct Node source imports and Webpack browser builds can expose different namespace shapes:

1. Webpack ESM resolution can expose `toggle` at the namespace top level.
2. Node CommonJS interop can expose an object under `default`.
3. Some CommonJS namespace forms may expose `slidetoggle` or `module.exports`.

The current `slideToggle` resolver checks those shapes in this order:

1. `namespace.toggle`
2. `Reflect.get(namespace, 'default')?.toggle`
3. `Reflect.get(namespace, 'slidetoggle')?.toggle`
4. `Reflect.get(namespace, 'module.exports')?.toggle`

Runtime reflection is intentional for fallback keys because direct property access to non-Webpack exports can make Webpack treat them as missing static exports.

## Outputs

The processing output is the `slideToggle` function value included in both:

- the default export object from `public/lib.js`
- the named `slideToggle` export from `public/lib.js`

The default export and named export must refer to the same value.

## Staged Processing Flow

1. Import the `slidetoggle` namespace.
2. Read the Webpack-preferred top-level `toggle` property.
3. If missing, read known CommonJS fallback containers through `Reflect.get`.
4. Select the first fallback container whose `.toggle` value exists.
5. Export that selected value as `slideToggle`.
6. Include the same selected value in the default export object.

## Key Rules

- The resolver must not return `undefined` for the installed `slidetoggle@4.x` package.
- The resolver is first-match-wins.
- Direct named-property reads are safe for `toggle` because it is the Webpack ESM export.
- Fallback containers are read through `Reflect.get` to preserve Webpack module-output validation.
- Legacy globals are installed only by `initLibraryShims()` and only when the target global is absent.

## Output Schema

```json
{
  "slideToggle": "Function",
  "default.slideToggle": "same Function reference",
  "legacyGlobals": "selected window keys installed only when absent"
}
```

## Sandbox Verification

Run:

```powershell
uv run python .docs/logic-description/frontend_shared_library_boundary_sandbox_proof.py
```

The proof script embeds fake namespace objects for Webpack, Node CommonJS default, legacy `slidetoggle`, and `module.exports` shapes. It also verifies first-match precedence and the non-clobbering legacy-global rule.

## Boundaries And Failure Modes

- If all known namespace shapes are missing, `slideToggle` resolves to `None` in the proof model and `undefined` in JavaScript; the boundary test must fail because the documented export is not a function.
- If a fallback shape exists but `.toggle` is not callable, the focused Jest test still catches the production boundary through `expect.any(Function)`.
- If a legacy global already exists, `initLibraryShims()` must leave it unchanged.
