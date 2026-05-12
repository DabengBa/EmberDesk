# Thumbnail JPEG Quality Tuning

## Feature Summary

This slice lowers EmberDesk's shipped JPEG thumbnail default from `95` to `85` so newly generated avatar, persona, and background thumbnails can use fewer bytes by default without changing dimensions, routes, or explicit per-install overrides.

The delivered change is intentionally narrow:

- no route contract changes
- no dimension changes
- no cache migration
- no per-type quality knobs

## Why This Change Exists

EmberDesk already defaulted to JPEG thumbnails, but both the shipped config and the runtime fallback still used a relatively high default quality of `95`.

That made regenerated thumbnails larger than necessary for their small display sizes, while most of the visible fidelity benefit was negligible at thumbnail scale.

## Delivered Behavior

- `default/config.yaml` now ships `thumbnails.quality: 85`
- `src/endpoints/thumbnails.js` now uses `85` as the runtime fallback when the key is absent
- newly generated JPEG thumbnails therefore default to `85`
- explicit per-install overrides such as `thumbnails.quality: 95` remain unchanged
- PNG mode still ignores JPEG quality settings
- previously cached thumbnail files remain on disk until an operator clears the relevant thumbnail folders and lets normal browsing regenerate them

## Implementation Notes

Changed code:

- `default/config.yaml`
  - changed the shipped JPEG thumbnail default from `95` to `85`
- `src/endpoints/thumbnails.js`
  - changed the `getConfigValue('thumbnails.quality', ...)` fallback from `95` to `85`

Added proof:

- `tests/thumbnail-jpeg-quality-tuning.test.js`
  - asserts the shipped YAML default is `85`
  - asserts the runtime fallback is `85` when the config key is absent
  - asserts JPEG mode passes `{ quality: 85, jpegColorSpace: 'ycbcr' }`
  - asserts explicit `95` overrides remain intact
  - asserts PNG mode does not receive JPEG quality options

Updated docs:

- `.docs/db/features/character-library-panel.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/interaction-performance-indexing.md`

## Validation

- Change classification:
  - `uv run python C:/SyncFiles/Softwares_Downloads/dev/Agents-Prompt/.codex/skills/delivery-workflow/scripts/classify_changes.py default/config.yaml src/endpoints/thumbnails.js tests/thumbnail-jpeg-quality-tuning.test.js .docs/specs/260512-04-thumbnail-jpeg-quality-tuning/plan.md`
- Failing-then-passing proof:
  - red: `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-jpeg-quality-tuning.test.js --runInBand --config tests/jest.config.json`
  - green: same command after changing both defaults to `85`
- Adjacent regression sweep:
  - `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-jpeg-quality-tuning.test.js tests/thumbnail-cache-headers.test.js --runInBand --config tests/jest.config.json`
- Semantic docs:
  - `npm run docs:check`
  - `npm run docs:build`

## Review Outcome

- `audit.md` closed with no blocking findings.
- The double-default rollout bug is fixed: changing only `default/config.yaml` would have missed installs that fall back through code, but this slice updates both surfaces together.
- Explicit overrides and existing cached thumbnails remain stable, which matches the intended upgrade behavior.

## Validation Boundary

- The approved design originally targeted a true generated-byte comparison between JPEG `95` and `85`.
- In this local Windows environment, the current upstream Jimp wasm JPEG/PNG encoders fail during real encode with `fetch failed`, even when exercised under an official standalone Node `20.20.2` binary.
- The automated proof therefore locks the real changed surface directly instead of claiming a dishonest end-to-end byte-size measurement.

## Residual Boundaries

- Existing cached thumbnail files are not automatically rebuilt by this change.
- Existing installs with an explicit `thumbnails.quality` value do not change until the operator edits or removes that key.
- Manual visual inspection of gradient-heavy background thumbnails remains advisable before broad production rollout because this slice changes default compression, not just config text.
