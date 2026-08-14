## Task 1 proof

- Command: `pnpm run test:compat`; `node --check public/script.js`; `find public/scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check`
- Result: PASS (2 suites, 22 tests; actual first-party importer set equals the fixed 70-entry allowlist)
- Summary: recursive static reverse-import gate is fixed, exact, and excludes vendored third-party extensions
- Artifacts: `tests/helpers/script-js-reverse-import-contract.js`, `tests/script-js-composition-root.test.js`, `.docs/adr/0014-workspace-composition-root.md`
- Environment: Node `v24.16.0`; diagnostic proof only, not release proof
