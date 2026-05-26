# Audit

## Scope

Review feedback landing for `e640bbae2` (`fix: associate login errors with fields`).

## Findings

- Addressed: login error regions now use `role="alert"` with `aria-live="assertive"` in `public/login.html`.
- Addressed: client validation remains field-associated for `handle` only.
- Addressed: authentication and network failures now stay form-level and no longer mark the handle field.
- Addressed: `hideError()` clears `tabindex`, so empty error blocks are not left tabbable.
- Addressed: repeated lockout updates no longer refocus the error block when it is already active.
- Addressed: `showError()` now uses an options object and the credential field list is internal to the controller.
- Addressed: login controller tests now share a single fake DOM harness and use event dispatch instead of listener indexing.

## Verification

- Red proof: `bun run --cwd tests test:unit -- login-page-controller.test.js --runInBand` failed before the implementation update.
- `bun run --cwd tests test:unit -- login-page-controller.test.js --runInBand`
- `bun run test:compat`
- `node tests/node_modules/eslint/bin/eslint.js tests/login-page-controller.test.js public/scripts/login.js`
- `git diff --check`

## Notes

- The repository-wide `bun run --cwd tests lint -- ...` script still reports unrelated legacy lint debt outside this change set. The targeted eslint command above passes for the touched login files.
