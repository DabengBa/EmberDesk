# Task 03 Evidence — Slash commands share background service helpers

## Commands
- `bun run --cwd tests test:unit -- background-library-service.test.js background-panel-controller.test.js --runInBand`
- `bun run test:compat`

## Result
- PASS unit + compat
- `/lockbg`, `/unlockbg`, `/autobg` callbacks call `lockCurrentBackground` / `unlockCurrentBackground` / `runAutoBackgroundSelection`
- Those helpers go through `createBackgroundLibrarySession` first, with legacy DOM highlight sync and no-chat warning preserved
- Public barrel still exports action helpers; slash registration no longer calls `onLockBackgroundClick` / `onUnlockBackgroundClick` / `autoBackgroundCommand` directly

## PM
- UI bridge actions and slash callbacks share the same exported helpers
- Compat suite remains green for slash/public export contracts

## Summary
Task 3 contracts slash commands onto the same service-backed helpers used by React bridge actions, and keeps `backgrounds.js` as a command/service facade rather than a second behavior owner for lock/unlock/auto.
