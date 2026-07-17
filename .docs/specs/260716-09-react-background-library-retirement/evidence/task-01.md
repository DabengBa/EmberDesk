# Task 01 Evidence — Background catalog/action service

## Commands
- Red: `bun run --cwd tests test:unit -- background-library-service.test.js --runInBand` (failed: modules missing / facade not wired)
- Green: `bun run --cwd tests test:unit -- background-library-service.test.js background-panel-controller.test.js thumbnail-lazy-image-loading.test.js thumbnail-cache-headers.test.js thumbnail-write-time-pregeneration.test.js --runInBand`

## Result
- PASS 31 tests across new background service suite + plan-listed unit surfaces
- New modules:
  - `public/scripts/background-domain.js` pure path/url/sort/filter/folder/gallery projection
  - `public/scripts/background-library-service.js` DOM-free session (load/select/lock/upload/rename/delete/refresh/folder)
- `public/scripts/backgrounds.js` reuses domain helpers and creates `createBackgroundLibrarySession` for service-owned catalog/action results without reading gallery DOM inside the service

## PM
- Fixtures exercised via service session load/filter/sort/folder/select/lock/unlock/upload/rename/delete/refresh without gallery DOM
- Failed delete rolls back catalog/settings/lock state and returns `ok: false`
- Existing thumbnail + panel controller unit surfaces remain green

## Summary
Task 1 extracts pure domain helpers and a stateful background library session. Legacy gallery DOM rendering and jQuery handlers remain in the facade for now; React can consume service snapshots without depending on `#bg_menu_content` / `#bg_custom_content` as the catalog owner.
