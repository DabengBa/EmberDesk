# Task 03 Evidence

## Command
```bash
bun run --cwd tests test:unit -- settings-react-route.test.js react-workspace-panels-helpers.test.js --runInBand
bun run build:react
```

## Result
- unit: 47 passed
- missing build still 503 via settings-react-route tests
- `/settings` full-page still served by React page app

## Summary
Deep-link full page retained; shell daily path is overlay only.
