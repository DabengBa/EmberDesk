# Thumbnail Placeholder Background

## Feature Summary

This slice adds a themed placeholder background to shared avatar image surfaces so avatar-heavy lists show a calmer non-white paint surface while thumbnails are still loading or decoding.

The delivered change is intentionally narrow:

- CSS-only
- no new runtime logic
- no request-flow changes
- no layout or box-model changes

## Why This Change Exists

Before this change, avatar image boxes could briefly show a hard white or transparent flash before thumbnail pixels painted.

That was most noticeable on avatar-dense list surfaces during cold loads, slow decode windows, or transparent-avatar cases. The goal of this slice is polish rather than raw speed.

## Delivered Behavior

- The shared `.avatar img` rule now includes:
  - `background-color: var(--SmartThemeBlurTintColor);`
- The placeholder color lands on the image paint surface itself, not on wrapper elements.
- Opaque thumbnails fully cover the placeholder after paint.
- Transparent avatar regions may continue to reveal the tint by design.
- Existing avatar sizing, border, radius, and shadow styling remain unchanged.

## Implementation Notes

Changed code:

- `public/style.css`
  - added `background-color: var(--SmartThemeBlurTintColor);` to the shared `.avatar img` rule

Added proof:

- `tests/thumbnail-placeholder-background.test.js`
  - binds directly to the `.avatar img` rule
  - fails if the placeholder background declaration is removed

Updated docs:

- `.docs/db/features/character-library-panel.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/interaction-performance-indexing.md`

## Validation

- Stage gate:
  - `uv run python C:/SyncFiles/Softwares_Downloads/dev/Agents-Prompt/.codex/skills/delivery-workflow/scripts/detect_stage.py --spec-dir .docs/specs/260512-03-thumbnail-placeholder-background`
- Change classification:
  - `uv run python C:/SyncFiles/Softwares_Downloads/dev/Agents-Prompt/.codex/skills/delivery-workflow/scripts/classify_changes.py public/style.css tests/thumbnail-placeholder-background.test.js .docs/specs/260512-03-thumbnail-placeholder-background/plan.md`
- Failing-then-passing proof:
  - red: `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-placeholder-background.test.js --runInBand --config tests/jest.config.json`
  - green: same command after the CSS change
- Regression sweep:
  - `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js tests/thumbnail-placeholder-background.test.js tests/thumbnail-lazy-image-loading.test.js tests/thumbnail-cache-headers.test.js --runInBand --config tests/jest.config.json`
- Semantic docs:
  - `npm run docs:check`
  - `npm run docs:build`

## Review Outcome

- `audit.md` closed with no blocking findings.
- The slice is frontend-only and CSS-only.
- No browser-side request or state regressions were introduced.

## Residual Boundaries

- This slice improves perceived polish only; it does not reduce first-byte time, network transfer size, or thumbnail generation cost.
- On opaque JPEG thumbnails, the visible effect is mainly limited to the load/decode window.
- Transparent avatars can continue to show the tint through transparent regions by design.
