# Task 03 Evidence — internal bridge non-public boundary

## Commands
- `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js third-party-extension-compatibility.test.js --runInBand`

## Result
- PASS bridge suite including:
  - does not publish the bridge as a third-party public contract entry
  - attach and detach leave public SillyTavern and event exports identity-stable
- PASS compat suite exclusions for internal-only names

## Summary
Public contract families exclude `__emberDeskReactCompatibilityBridge`. Attach/detach preserves public global identity and removes the internal property on detach.
