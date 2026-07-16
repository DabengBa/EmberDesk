# Task 02 Evidence — Direct command/service save path

## Commands
- `bun run --cwd tests test:unit -- character-authoring-facade.test.js group-authoring-facade.test.js character-write-service.test.js character-card-helpers.test.js react-workspace-panels-helpers.test.js --runInBand`

## Result
- PASS 5 suites / 67 tests
- Character save builds multipart FormData via `buildCharacterAuthoringFormData` and POSTs `/api/characters/create|edit` without `waitForCharacterAuthoringSaveCompletion` or create-button click
- Group save POSTs `/api/groups/create` or `editGroup(..., true, true)` without `#rm_group_submit` click
- Save failures throw so React mutation keeps dirty draft; success returns identity (`avatar` / group `id`)

## Summary
Authoring bridge write path is direct API/service. Legacy form values may still be mirrored for tool popups, but success is not inferred from DOM mutation.
