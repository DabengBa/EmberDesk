## Task 4 proof

- Command: `pnpm run test:compat`; `node --check public/script.js`; `find public/scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check`; `pnpm run docs:check`; `pnpm run docs:build`
- Result: PASS (2 suites, 22 tests; 30 semantic docs validated and rebuilt; syntax clean)
- Summary: approved extracted implementations are removed from `script.js`, `bootstrapWorkspace()` and public re-exports remain, and documentation now states that remaining domain/DOM/React owners are later-wave scope
- Artifacts: `public/script.js`, `tests/script-js-composition-root.test.js`, `.docs/adr/0014-workspace-composition-root.md`, `.docs/db/`
- Boundary: `script.js` is not yet assembly-only; this wave freezes the boundary and cuts the highest-frequency reverse dependencies
- Environment: Node `v24.16.0`; diagnostic proof only, not release proof
