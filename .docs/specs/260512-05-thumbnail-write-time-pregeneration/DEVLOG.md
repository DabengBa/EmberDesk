# Thumbnail Write-Time Pregeneration

## Why

This slice removes a common first-view thumbnail stall after character or persona writes.

Before this change, newly created or updated assets still relied on the first later `/thumbnail` request to do synchronous image decode, resize, and encode work. That made the next ordinary library or workspace revisit pay the thumbnail-generation cost at browse time instead of at write time.

## Delivered

### Shared character-write hook

`src/endpoints/characters.js` now starts best-effort avatar thumbnail pregeneration immediately after successful canonical character PNG writes.

Delivered behavior:

- shared character writes now invalidate any existing avatar thumbnail before overwriting the canonical PNG
- avatar pregeneration starts after the canonical write succeeds
- the response does not wait for pregeneration to finish
- pregeneration rejection is caught and logged so the canonical write still succeeds

### Explicit `/duplicate` coverage

`/duplicate` still bypasses the shared write helper, so this slice added a route-local post-copy pregeneration hook there as well.

Delivered behavior:

- duplicated character PNGs now also start best-effort avatar thumbnail pregeneration
- route response timing is still governed by the existing copy/index-refresh path, not thumbnail completion

### Persona upload coverage

`src/endpoints/avatars.js` now starts best-effort persona thumbnail pregeneration after the canonical persona image lands.

Delivered behavior:

- overwrite invalidation stays in place before the new persona write
- pregeneration starts only after the new canonical persona image is persisted
- the existing cache-buster and route response contract stay unchanged

### Follow-up narrowing of pregeneration triggers

After the initial delivery, a follow-up correctness fix narrowed when pregeneration is allowed to run.

Final delivered behavior also includes:

- pregeneration now respects the global `thumbnails.enabled` switch instead of running unconditionally in write paths
- metadata-only character rewrites no longer invalidate or rebuild thumbnails when the image pixels are unchanged
- the shared character write helper now accepts a `shouldRegenerateThumbnail` path-level decision so routes such as `/edit` without a new file, `/edit-attribute`, and `mergeCharacterUpdate` can opt out safely
- persona-side pregeneration uses the same `thumbnails.enabled` guard before starting background thumbnail work

### Overwrite-ordering fix

Centralizing pregeneration in the shared character-write path exposed an overwrite-ordering hazard: some routes were still invalidating thumbnails after the write helper returned, which would delete the freshly pregenerated thumbnail.

Final delivered behavior:

- shared character writes own overwrite invalidation before the canonical write
- post-write invalidation calls were removed from character overwrite paths that would otherwise delete the new thumbnail
- preserved-name import overwrites no longer invalidate after the helper has already pregenerated the replacement thumbnail

## Validation

### Stage gates

- `uv run python C:\Users\Administrator\.codex\skills\delivery-workflow\scripts\detect_stage.py --spec-dir .docs/specs/260512-05-thumbnail-write-time-pregeneration --expect-stage documentation-and-wrap`

### Focused proof

- `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-write-time-pregeneration.test.js --runInBand --config tests/jest.config.json`

Covered by the focused test file:

- non-blocking character-write pregeneration
- failure-safe pregeneration rejection handling
- disabled-thumbnail deployments skipping pregeneration
- `/duplicate` pregeneration coverage
- character overwrite invalidation ordering
- metadata-only character edits skipping invalidation and pregeneration
- persona upload pregeneration coverage

### Regression sweep

- `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-write-time-pregeneration.test.js tests/thumbnail-cache-headers.test.js --runInBand --config tests/jest.config.json`

### Documentation validation

- `npm run docs:check`
- `npm run docs:build`

## Documentation

Updated:

- `.docs/db/features/character-library-panel.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/interaction-performance-indexing.md`

## Review Outcome

Final review found no remaining correctness, regression, security, or scope-discipline issues in the delivered slice.

`classify_changes.py` marked the change as touching a user-facing surface, so the review explicitly checked route-contract and fallback behavior. No separate UX walkthrough was required because the final diff did not change DOM, templates, CSS, navigation, or CTA sequencing.

## Boundaries

- This slice does not backfill old libraries; only newly written or rewritten character/persona assets gain write-time pregeneration.
- Mutation success responses still do not guarantee pregeneration has completed before the next request arrives; a very fast follow-up `/thumbnail` can still race and fall back to the existing on-demand path.
- This slice does not introduce a background queue, bulk warmup worker, or thumbnail generation scheduler.
