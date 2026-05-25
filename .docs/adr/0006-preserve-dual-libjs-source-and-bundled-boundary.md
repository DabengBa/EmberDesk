# ADR-0006: Preserve `/lib.js` as both source-import and bundled-browser boundary

Status: accepted

`public/lib.js` is imported directly by Node/Jest tests and source-relative browser modules, while production browser delivery still goes through Webpack module output. Some dependencies, such as `slidetoggle`, expose different namespace shapes through Node's CommonJS interop than they expose through Webpack's ESM resolution.

The decision is to keep one `public/lib.js` boundary and normalize dependency export shapes inside that file instead of creating separate source-only and bundled-only wrappers. This keeps the documented import contract stable for first-party modules and extension authors, while forcing dependency interop quirks to be captured by focused boundary tests.

Consequences:

- `slideToggle` must resolve to a real function in both direct source imports and bundled `/lib.js` output.
- Dependency fallback logic belongs beside the import in `public/lib.js`, not in call sites.
- Static Webpack export checks still matter, so fallback reads for non-Webpack namespace keys use runtime reflection instead of direct named-property access.
- The focused test suite is the contract owner for default exports, named exports, legacy globals, and bundled module importability.
