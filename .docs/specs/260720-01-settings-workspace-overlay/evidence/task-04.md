# Task 04 Evidence

## Command
```bash
PLAYWRIGHT_PORT=8020 node tests/node_modules/@playwright/test/cli.js test workspace-shell-panel-navigation.e2e.js --workers=1 -g "in-workspace overlay|overlay tabs without route jump"
PLAYWRIGHT_PORT=8021 node tests/node_modules/@playwright/test/cli.js test settings.e2e.js --workers=1
```

## Result
- overlay e2e: 2 passed (Settings open/close without leaving `/`; AI Config/Formatting open Providers/Advanced tabs)
- settings.e2e.js: 3 passed (full-page sole-owner, conflict, mobile save)

## Summary
Browser proof for overlay primary path and full-page regression.
