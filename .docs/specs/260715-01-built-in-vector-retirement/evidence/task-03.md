# Task 03 Evidence

- `PLAYWRIGHT_REUSE_SERVER=0 PLAYWRIGHT_CHROME_EXECUTABLE=/usr/bin/google-chrome-stable bun run --cwd tests test:e2e -- vector-retirement.e2e.js` passed.
- The authenticated workspace exposes Data Bank from the wand menu, hides retired vector UI, and a CSRF-valid stale `/api/vector/query` request returns the stable JSON `410` response.
