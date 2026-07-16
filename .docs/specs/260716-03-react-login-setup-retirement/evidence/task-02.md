# Task 02 Evidence — delete legacy pages/controllers/flags

## Commands
- `bun run --cwd tests test:unit -- login-react-route.test.js setup-react-route.test.js login-page-controller.test.js setup-page-controller.test.js --runInBand`
- `bun run build:react`

## Result
- PASS absence proofs for `public/login.html`, `public/setup.html`, `public/scripts/login.js`, `public/scripts/setup.js`, `src/react-setup-feature.js`, and login/setup feature flags
- React build succeeded

## Summary
Removed legacy page owners and flags. Shared helpers (`login-shared.js`, `setup-shared.js`) retained for the React owner.
