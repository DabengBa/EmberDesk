# Task 04 Evidence — delete legacy host controls / flag / fallback

## Commands
- `bun run --cwd tests test:unit -- workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js third-party-extension-compatibility.test.js extension-host-service.test.js --runInBand`
- `bun run build:react:workspace-panels`

## Result
- PASS 56 focused unit tests; workspace-panels build green
- Product flag retired: `isReactExtensionsHostPanelEnabled()` always returns true
- Defaults: `extensionsHost: true` in `default/config.yaml`, `public/script.js`, and `workspace-panels-react-bridge.js`
- Playwright helper always enables Extensions Host for e2e bootstrap
- `hideLegacyExtensionsHostControls(true)` on React host ensure/mount; drawer `dataset.extensionsHostVisibleOwner = 'react'`
- Protected mount slots remain present for compatibility (`#extensions_settings`, `#regex_container`, wand menu)
- Legacy visible notify/manage/install/Extras chrome is hidden/inert when React owns the surface

## PM
- Open Extensions: React host is the visible control owner; protected slots stay reachable for third-party mounts
- No product flag-off path remains that restores legacy host controls as the sole UI

## Summary
Task 4 retires the Extensions Host product flag and dual-owner visible chrome. React is the sole visible host; compatibility slots and service barrel remain for extension content and operations.
