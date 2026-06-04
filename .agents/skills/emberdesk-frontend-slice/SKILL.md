---
name: emberdesk-frontend-slice
description: Build or refactor EmberDesk frontend slices safely. Use for public HTML/CSS/jQuery changes, page controllers, character list UI, World Info panels, Prompt Manager UI, shared /lib.js, extensions, slash commands, macros, and compatibility-sensitive browser work.
---

# EmberDesk Frontend Slice

Use this before changing anything under `public/` or frontend tests.

## Read First

- `public/script.js` for main shell startup and exported compatibility surfaces.
- `public/lib.js`, `webpack.config.js`, `.docs/tech/frontend-shared-library-boundary.md`, `.docs/adr/0006-preserve-dual-libjs-source-and-bundled-boundary.md` before touching `/lib.js`.
- `.docs/tech/frontend-jquery-slice-migration.md` before creating or extending page-level controllers.
- `.docs/tech/third-party-extension-compatibility.md` before touching regex, extensions, character list, slash commands, world info regex, message rendering, or `@sillytavern/*`.
- Existing specs under `docs/specs/` for active slice constraints.
- Focused tests under `tests/` and `tests/frontend/`.

## Established Patterns

- EmberDesk still uses HTML/CSS/jQuery. Do not introduce React, Vue, a SPA framework, or TypeScript application code without explicit approval.
- Small page-local surfaces may use the controller pattern from `public/scripts/login.js` and `public/scripts/setup.js`: pure helpers, `createXController(root, dependencyOverrides)`, `initXPage()`, auto-init guard, cleanup through `AbortController`, and dependency injection for tests.
- `public/script.js` owns the main workspace startup sequence. Do not move global startup work into a page slice without a design.
- `public/lib.js` is both source-import and bundled browser boundary. Normalize dependency interop there, not in call sites.
- Prefer delegated events for dynamic list rows that are rebuilt by filtering, paging, or rendering.

## Protected Compatibility Surfaces

- Extension mount points: `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, `#extensionsMenu`, `#chat > .mes`, `.mes_text`.
- Character list identity: `#rm_characters_block`, `#rm_print_characters_block`, `.character_select`, `.group_select`, `.bogus_folder_select`, `.character_select[data-chid]`, legacy `.character_select[chid]`, `id="CharID${chid}"`, `.character_selected`, `.bulk_select_checkbox`, `.tags_inline`, `.ch_fav`.
- Browser module imports: `@sillytavern/script`, `@sillytavern/scripts/extensions`, `@sillytavern/scripts/extensions/regex/engine`, `@sillytavern/scripts/openai`, `@sillytavern/scripts/preset-manager`, `@sillytavern/scripts/world-info`, `@sillytavern/scripts/slash-commands`, `@sillytavern/scripts/utils`.
- Regex data: `extension_settings.regex`, character/preset regex script storage, `regex_placement.*` numeric values.
- Events from `eventSource` and `event_types` in `public/script.js` and `public/scripts/events.js`.

## Workflow

1. Classify whether the change is page-local, workspace shell, shared library, extension compatibility, or high-risk rendering/generation.
2. Read the relevant docs and tests before editing.
3. Add focused proof first for behavior changes.
4. Keep DOM IDs/classes stable unless a migration plan updates code, docs, and compatibility tests together.
5. Prefer local helper extraction over new global state or a new store.
6. Use role/name/label locators for browser tests; use CSS selectors only when asserting legacy DOM contracts.

## Reuse Points

- `public/scripts/login.js` and `public/scripts/setup.js` for controller shape.
- `public/scripts/character-list-state.js` for client-side list consistency helpers.
- `public/scripts/BulkEditOverlay.js` and `public/scripts/bulk-edit.js` for bulk selection ownership.
- `public/scripts/world-info.js` for World Info UI binding and data flow.
- `public/scripts/utils.js` and `public/lib.js` before adding new browser helpers.

## Validation

```powershell
bun run test:compat
bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand
bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand
bun run --cwd tests test:unit -- login-page-controller.test.js setup-page-controller.test.js --runInBand
bun run --cwd tests test:e2e -- login.e2e.js
```

Choose the subset that matches touched files. Use Chrome DevTools MCP for real browser rendering, layout, console, and network verification when UI behavior or layout changes.
