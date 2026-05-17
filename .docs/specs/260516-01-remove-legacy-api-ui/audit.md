# Remove Legacy API UI Review Audit

## Feedback Disposition

- Fixed P2: Added/retained committed `.preset-popup-menu` styles in `public/style.css` so the overflow menu is hidden by default and displayed by the `show` class.
- Fixed P2: Removed `max_context_unlocked` from the OpenAI preset/settings UI mapping in `public/scripts/openai.js`, delete the legacy field during settings/preset migration, and strip it when exporting legacy presets.
- Fixed P2: Removed the `body.vertexai-active #api_key_section` hiding rule so Vertex AI Express keeps the unified API key input visible for first-time API key setup.
- Fixed P3: Stopped propagation on `.preset-popup-menu-item` clicks so Import/Export/Delete close the popup instead of re-opening it through the parent trigger.

## Verification

- `node --check public/scripts/openai.js`: passed.
- `npm --prefix tests run test:unit -- vertexai-api-key-visibility.test.js`: failed before the CSS fix on the hidden Vertex API key rule, then passed after removing it.
- `rg -n "max_context_unlocked: \\['#oai_max_context_unlocked|oai_max_context_unlocked|preset-popup-menu|preset-popup-menu-item" public/scripts/openai.js public/style.css public/index.html`: confirmed no hidden unlock selector remains and the popup menu markup/styles/handlers are present.
- `git diff --check -- public/scripts/openai.js public/style.css public/index.html`: passed, with only Git's existing LF-to-CRLF warning for `public/scripts/openai.js`.
- `npx eslint public/scripts/openai.js`: failed on pre-existing lint issues in this file, including unused imports, existing brace-style errors, unreachable code, and whitespace errors unrelated to this fix.
