# Task 04 Evidence — legacy flags/fallback retirement

## Commands
- `bun run build:react:workspace-panels`
- `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js character-authoring-facade.test.js group-authoring-facade.test.js --runInBand`

## Result
- PASS unit suites (52 tests) and workspace-panels build (659.66 kB)
- `isReactCharacterAuthoringPanelEnabled` / `isReactGroupAuthoringPanelEnabled` always true
- `default/config.yaml` no longer lists characterAuthoring/groupAuthoring product flags
- Mount path always hides legacy form; missing build shows fail-closed error host, not legacy dual owner
- Playwright helper always builds workspace-panels and forces authoring sole-owner env flags

## Summary
React authoring is sole owner. Legacy forms remain as non-editable host for tool entry points (export/world/greetings/delete confirmation) but are not re-enabled as product fallback.
