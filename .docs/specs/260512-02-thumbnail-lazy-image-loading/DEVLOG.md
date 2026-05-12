# Thumbnail Lazy Image Loading

## Why

This slice reduces avoidable upfront image work on character-heavy list surfaces without changing thumbnail URLs, storage, or render scheduling logic.

Before this change, list-style avatar templates loaded through normal browser behavior with no explicit native hints, even when many of those images were offscreen.

## Delivered

### Template-owned lazy/decode hints

Added `loading="lazy"` and `decoding="async"` to the template-owned avatar `<img>` tags for:

- character list rows
- inline avatar strips
- group member rows
- group collage avatars
- past-chat rows
- welcome recent-chat rows

Primary files:

- `public/index.html`
- `public/scripts/templates/welcomePanel.html`

### No JS render-path churn

The existing jQuery clone/render paths were intentionally left unchanged:

- `public/script.js`
- `public/scripts/group-chats.js`
- `public/scripts/swipe-picker.js`

This keeps the slice narrow:

- existing `src` assignment still works as before
- active-chat avatar rendering is untouched
- cache-buster and thumbnail URL behavior are unchanged

### Regression guard

Added focused template assertions at:

- `tests/thumbnail-lazy-image-loading.test.js`

The test reads the relevant HTML templates and verifies the shipped attribute pair is present on every in-scope surface.

## Validation

### Red-first proof

Failed before the template edits:

- `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-lazy-image-loading.test.js --runInBand --config tests/jest.config.json`

Failure reason:

- missing `loading="lazy"` / `decoding="async"` template fragments

### Green proof

Passed after the template edits:

- `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-lazy-image-loading.test.js --runInBand --config tests/jest.config.json`

Related regression validation also passed:

- `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-cache-headers.test.js tests/seed-dev-environment.test.js tests/thumbnail-lazy-image-loading.test.js --runInBand --config tests/jest.config.json`

### Manual/browser check

Local dev verification on `http://127.0.0.1:8000/` confirmed that:

- character-list avatars still render
- group collage avatars still render
- welcome recent-chat avatars still render

## Documentation

Updated:

- `.docs/db/features/character-library-panel.md`
- `.docs/tech/interaction-performance-indexing.md`

Docs validation passed:

- `npm run docs:check`
- `npm run docs:build`

## Review Outcome

Final review found no blocking correctness, regression, security, or scope-discipline issues in the delivered slice.

## Boundaries

- This slice adds native browser hints only; it does not benchmark or guarantee large wins on small lists.
- It does not change active-chat avatars, thumbnail cache headers, image dimensions, placeholders, or virtualization.
