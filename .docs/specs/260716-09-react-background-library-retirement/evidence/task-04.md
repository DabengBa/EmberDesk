# Task 04 Evidence — delete legacy panel controller / flag / fallback ownership

## Commands
- `bun run --cwd tests test:unit -- background-library-service.test.js background-panel-controller.test.js react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js --runInBand`
- `bun run build:react:workspace-panels`

## Result
- PASS 46 focused unit tests; workspace-panels build green
- `isReactBackgroundLibraryPanelEnabled()` always returns true (product flag retired)
- defaults: `backgroundLibrary: true` in bridge defaults + config
- `hideLegacyBackgroundGallery(true)` on React host mount; drawer `dataset.backgroundLibraryVisibleOwner = 'react'`
- deleted `public/scripts/background-panel-controller.js`; loading/status owned by service + domain helper
- React host carries `data-doc-id="feature.background_library_panel"`

## PM
- Open Backgrounds: React gallery host is the visible owner; legacy `#bg_menu_content` gallery is hidden/inert compatibility DOM
- No feature-flag path remains that restores the legacy gallery as the product UI

## Summary
Task 4 retires the Background Library product flag and panel-controller DOM owner. The same workspace entry mounts React as sole visible owner while service-backed helpers remain the action path.

## Review fix
- Added React folder enter/exit after sole-owner hide of legacy folder grid.
