# Task 04 Partial Evidence

## Scope

- Removed the shell takeover/strict feature flags, inline workspace feature payload, takeover contract, shell diagnostics, and same-version legacy-chrome restoration path.
- Removed the legacy top-bar chrome and the shell drawer adapter/state APIs. Declared child slots now manipulate only their own host/content presentation and do not invoke the global drawer click handler.
- Fixed shell-host insertion to use `#sheld`'s actual parent, preventing startup from failing before `app:ready`.
- The React shell mounts unconditionally; a missing or invalid shell bundle is a release defect rather than a runtime fallback decision.

## Red-Green

- Red: `bun run --cwd tests test:unit -- chat-workspace-structure.test.js --runInBand -t 'retires same-version shell takeover flags and fallback diagnostics'`
  - Result: failed because the takeover contract import was still present.
- Green: the same focused test passed after the retirement changes.

## Verification

- `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js global-compatibility-bridge.test.js chat-workspace-structure.test.js character-library-react-panel-flag.test.js --runInBand`
  - Result: 64 tests passed.
- `bun run build:react:workspace-panels`
  - Result: Vite workspace panel bundle built successfully.
- `PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1`
  - Result: 11 Playwright tests passed on a fresh server.
- `PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1`
  - Result: 10 Playwright tests passed after adapter/top-bar retirement.

## Boundary

Protected child-slot DOM and extension compatibility providers remain as declared content hosts. They are not shell navigation, dock-state, or same-version fallback owners.
