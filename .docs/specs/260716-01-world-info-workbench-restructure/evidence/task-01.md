# Task 01 Evidence

## Summary
Fixed World Info drawer DOM containment so `#wiEditorPanel` is a child of `#wi-holder`, and made the React host the sole visible owner when mounted by hiding legacy workbench children with `hidden`/`aria-hidden`/`inert` (not tab-focusable duplicates).

## Changes
- `public/index.html`: corrected mismatched `section`/`div` closes; `#wi-holder` now contains both `#wiGlobalPanel` and `#wiEditorPanel`; `#WI-SP-button` closes correctly.
- `public/script.js`: `ensureWorldInfoReactHost()` mounts into `#wi-holder`; `hideLegacyWorldInfoWorkbench()` toggles visible owner; `mountReactWorldInfoPanel()` applies hide on mount and restores on flag-off.
- `public/css/world-info.css`: react-owned workbench layout and mobile single-scroll host rules.
- Structure tests in `tests/world-info-card-rendering.test.js` and host markers in `tests/react-workspace-panels-helpers.test.js`.

## Proof
```bash
bun run --cwd tests test:unit -- world-info-card-rendering.test.js react-workspace-panels-helpers.test.js --runInBand
```
Result: PASS (structure containment + hideLegacyWorldInfoWorkbench markers).

## TDD
Red: added failing containment/owner structure tests against pre-fix HTML/script markers.
Green: HTML + host ownership implementation.
Refactor: host parent prefers `#wi-holder` with editor fallback.

## PM
Flag-on path sets `data-world-info-visible-owner="react"` and inert-hides legacy children; flag-off/`onDisabled` restores legacy owner. Containment no longer relies on browser tag repair.
