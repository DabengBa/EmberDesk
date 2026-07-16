# Task 01 Evidence — World Info domain / repository / workbench services

## Commands
- Red: `bun run --cwd tests test:unit -- world-info-domain-service.test.js --runInBand` (failed: modules missing / facade not wired)
- Green: `bun run --cwd tests test:unit -- world-info-domain-service.test.js world-info-shell-context.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js --runInBand`

## Result
- PASS 34 tests across domain service, shell context, import feedback, converters, delete cascade
- New modules:
  - `public/scripts/world-info-domain.js` pure projection/sort/defaults
  - `public/scripts/world-info-workbench-service.js` DOM-free workbench session (select world/entry, summaries, field update, facade snapshot)
- `public/scripts/world-info.js` reuses domain helpers and workbench session for facade exports; prompt/import/delete paths remain behind existing facade APIs without workbench DOM for data projection

## PM
- Fixtures exercised via service session load/sort/select/update/snapshot without workbench DOM
- Existing unit surfaces for import/delete/shell context remain green

## Summary
Task 1 extracts pure domain and stateful workbench service seams. Prompt/scan and import/delete continue through the compatibility facade; list/detail/selection state for React can now call the service without Select2/editor DOM.
