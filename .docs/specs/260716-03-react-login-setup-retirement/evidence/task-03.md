# Task 03 Evidence — auth/recovery/setup/accessibility parity

## Commands
- `PLAYWRIGHT_CHROME_EXECUTABLE=/usr/bin/google-chrome-stable PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- login.e2e.js --workers=1`

## Result
- PASS 3 login e2e tests (12.4s): autofill semantics on `/login` and redirected `/login.html`, Chinese copy/error clearing, password toggle and recovery validation

## Summary
Canonical React login path covers autofill, recovery, and accessibility-oriented semantics; `/login.html` redirects into the same surface.
