# Task 02 Evidence — selection, bulk, mutation reconcile

## Commands
- `bun run --cwd tests test:unit -- character-list-state.test.js character-list-render-state.test.js character-list-structure.test.js --runInBand`

## Result
- PASS state/render-state/structure suites
- Panel state carries `bulkMode`, `selectedCharacterIds`, `activeCharacterId`
- Bridge handlers: `onSelectCharacter`, `onSelectGroup`, `onOpenFolder`, `onBulkToggleCharacter`, `onClearFilters`
- `syncReactCharacterLibraryToolbarState` refreshes React rows after bulk mode changes
- Delete reconcile helpers remain pure and cover late-snapshot/page safety

## Summary
Selection/bulk are driven through React row state and existing characterGroupOverlay model rather than hidden legacy toolbar owners.
