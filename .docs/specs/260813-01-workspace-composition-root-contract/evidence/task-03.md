## Task 3 proof

- Red proof: focused runtime tests failed because extracted CSRF state initialized as `null` instead of the old `undefined` shape.
- Green command: `pnpm run test:compat`
- Result: PASS (10 composition-root tests + 12 extension-compatibility tests; 22 tests combined)
- Summary: `request-context.js` owns token loading, headers, and Ajax prefilter while preserving pre-token header shape and startup error propagation; `public-api.js` installs only the explicit `SillyTavern` object; `script.js` keeps the approved header re-export
- Artifacts: `public/scripts/request-context.js`, `public/scripts/public-api.js`, `tests/script-js-composition-root.test.js`
- Environment: Node `v24.16.0`; diagnostic proof only, not release proof
