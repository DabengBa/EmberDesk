# Task 01 Evidence — React sole owner routes

## Commands
- `bun run --cwd tests test:unit -- login-react-route.test.js setup-react-route.test.js users-public-setup.test.js --runInBand`

## Result
- PASS login/setup route suites proving:
  - `/login` and `/setup` serve React build
  - `/login.html` and `/setup.html` redirect with query preservation
  - missing build returns HTTP 503 text error, not legacy HTML

## Summary
`createLoginPageMiddleware` / `createSetupPageMiddleware` always use React; legacy HTML redirect helpers added in `src/users.js` and mounted in `src/server-main.js`.
