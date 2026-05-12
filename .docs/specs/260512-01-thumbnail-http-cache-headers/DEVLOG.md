# Thumbnail HTTP Cache Headers

## Feature Summary

This slice adds a short-lived browser cache policy to non-Firefox `/thumbnail` responses so repeat avatar, persona, and background thumbnail loads can reuse browser cache or revalidate cheaply instead of redownloading the full image on every revisit.

Firefox keeps the existing `must-understand, no-store` behavior because EmberDesk already relies on that path to avoid stale image rendering after edits.

## Why This Change Exists

EmberDesk already stores generated thumbnails on disk, but the route still returned the default `public, max-age=0` file-serving policy. That meant repeated page visits and repeated list opens paid unnecessary thumbnail transfer cost even when the image file had not changed.

The goal of this slice is intentionally narrow:

- improve repeat thumbnail loads
- preserve current edit-time refresh behavior
- avoid changing canonical storage, startup payloads, or thumbnail generation semantics

## Delivered Behavior

- Non-Firefox `/thumbnail` responses now send:
  - `Cache-Control: private, max-age=3600, must-revalidate`
- The new policy is applied on both file-serving branches:
  - cached thumbnail hits
  - original-file fallbacks such as GIF or other skipped animated formats
- Firefox image responses still send:
  - `Cache-Control: must-understand, no-store`
- Conditional `If-None-Match` requests continue to return `304` through the existing Express/send validator path.
- Refresh-style requests still return normal `200` responses and keep the new cache header intact.

## Implementation Notes

Changed code:

- `src/endpoints/thumbnails.js`
  - added a small route-local helper to set the non-Firefox cache policy
  - called it before `sendFile(...)` in both the original fallback and cached-thumbnail branches

Added proof:

- `tests/thumbnail-cache-headers.test.js`
  - non-Firefox cached thumbnail hit
  - non-Firefox GIF/original fallback
  - Firefox no-store preservation
  - conditional `If-None-Match` -> `304`
  - refresh-style request -> `200`

Updated docs:

- `.docs/tech/interaction-performance-indexing.md`
- `.docs/db/features/character-library-panel.md`

## Validation

- Stage gates:
  - `detect_stage.py --expect-stage implementation`
  - `detect_stage.py --expect-stage final-review`
- Focused proof:
  - `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-cache-headers.test.js --runInBand --config tests/jest.config.json`
- Regression sweep:
  - `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-cache-headers.test.js tests/seed-dev-environment.test.js --runInBand --config tests/jest.config.json`
- Semantic docs:
  - `npm run docs:check`
  - `npm run docs:build`

## Residual Boundaries

- This slice optimizes repeat image loads only. It does not reduce first-view thumbnail generation cost or startup JSON bottlenecks.
- Editing-client refreshes remain immediate, but another concurrent client can still show a stale image until cache expiry or revalidation.
- `404` thumbnail responses remain unchanged and still do not receive an explicit cache policy from EmberDesk in this slice.
