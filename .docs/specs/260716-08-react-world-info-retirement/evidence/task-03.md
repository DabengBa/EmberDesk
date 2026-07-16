# Task 03 Evidence — public imports/events with service-backed barrel

## Commands
- `bun run --cwd tests test:unit -- world-info-domain-service.test.js world-info-shell-context.test.js --runInBand`
- `bun run test:compat`

## Result
- PASS domain/service barrel structural tests (9)
- PASS compat (12)
- `public/scripts/world-info.js` re-exports `createWorldInfoWorkbenchSession`, `buildWorldInfoReactPanelState`, sort helpers
- Pure projection/sort helpers are thin domain wrappers
- Workbench mutable state owned by session via `getWorldInfoWorkbenchSession`
- Shell context remains the only shell dependency seam (no `../script.js` import)
- Public path `@sillytavern/scripts/world-info` continues to resolve to the barrel

## PM
- Converter/prompt/entry helpers still exported from barrel; barrel no longer owns pure projection implementation or React panel state assembly

## Summary
Compatibility surface preserved; behavior ownership for workbench projection/state moved to domain + workbench service modules.
