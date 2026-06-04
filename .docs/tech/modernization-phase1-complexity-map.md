# Modernization Phase 1 Complexity Map

## Module Responsibility

This document records the Phase 1 complexity map for the EmberDesk modernization roadmap. It classifies the highest-risk modernization targets, the current ownership boundaries, safe extraction candidates, protected compatibility contracts, and minimum regression proof for future slices.

This is a planning and execution record for [modernization-roadmap.md](modernization-roadmap.md). It does not change product semantics and does not update `.docs/db/`.

## Baseline Context

- Date: 2026-06-02
- Workspace: `D:\DEV\EmberDesk`
- Phase 0 baseline: [modernization-phase0-baseline.md](modernization-phase0-baseline.md)
- Scope: complexity mapping only; no production refactor is included in this phase.

Phase 1 assumes the current modernization contracts remain in force:

- Node.js 26.3.0 Current (`>=26.3.0 <27`) is the application runtime contract.
- Bun is the package manager and script runner.
- Express 5 remains the server framework.
- The browser app remains HTML/CSS/jQuery.
- Webpack remains scoped to the `/lib.js` browser shared-library boundary.
- Canonical user data stays file-backed; SQLite and `DiskCache` remain derived acceleration.

## Architecture And Constraints

Phase 1 targets are not isolated files. They sit on compatibility, startup, data, and extension boundaries.

Protected frontend contracts:

- `public/script.js` keeps exporting shared browser shell state and functions consumed by first-party modules and extensions.
- `eventSource`, `event_types`, `globalThis.SillyTavern`, and `@sillytavern/*` import aliases remain compatibility surfaces.
- Character-list selectors and identity attributes remain stable: `.character_select`, `.group_select`, `.bogus_folder_select`, `data-chid`, legacy `chid`, `id="CharID${chid}"`, `.character_selected`, `.bulk_select_checkbox`, `.tags_inline`, and `.ch_fav`.
- Regex placement values, slash-command registration surfaces, world-info regex editing, and message rendering are protected extension-adjacent paths.
- `public/lib.js` keeps the dual source-import and bundled `/lib.js` contract described by [frontend-shared-library-boundary.md](frontend-shared-library-boundary.md).

Protected backend contracts:

- Character and chat endpoints continue to read and write file-backed canonical data under the user data root.
- `DiskCache` and `_cache/character-index.sqlite` are disposable derived caches.
- Path validation must keep using existing filename and parent-path guards.
- Route response shapes for existing API paths must stay stable unless a separate behavior change updates tests and owning docs.

## Complexity Inventory

| Area | File | Size | Primary Ownership | Risk Level |
|---|---:|---:|---|---|
| Browser shell | `public/script.js` | 13,112 lines / 532 KB | Startup, global app state, chat workspace, character list, message flow, event bridge | Critical |
| World info | `public/scripts/world-info.js` | 6,605 lines / 281 KB | Lorebook state, prompt activation, editor UI, import/export, slash commands | Critical |
| Slash commands | `public/scripts/slash-commands.js` | 6,951 lines / 294 KB | Parser registration, command execution, macros, message/chat actions, autocomplete | Critical |
| Provider settings | `public/scripts/openai.js` | 4,674 lines / 186 KB | Chat-completion settings, prompt assembly, provider params, model UI, secrets/proxy controls | High |
| Character routes | `src/endpoints/characters.js` | 2,132 lines / 88 KB | Character card parsing, import/export, mutation routes, derived cache/index maintenance | High |
| Chat routes | `src/endpoints/chats.js` | 1,124 lines / 44 KB | JSONL chat persistence, backups, import conversion, search, group chat routes | High |

## Module Maps

### `public/script.js`

Current responsibilities:

- Main browser shell startup and readiness events.
- Global app state exports for characters, chat, settings, selected entity, generation, and shared request helpers.
- `globalThis.SillyTavern` compatibility object and `eventSource` / `event_types` re-export surface.
- Character-list rendering, pagination, incremental reconcile, delete flow, active-character state, and selected-character navigation.
- Chat workspace behavior: load, save, edit, delete, import/export, message rendering, streaming/generation coordination, swipes, and UI event binding.
- Startup integration with extensions, macros, tokenizers, world info, provider settings, deferred panels, accessibility, keyboard, and shared library shims.

Main couplings:

- Direct imports from most frontend feature modules.
- Direct DOM binding across `#chat`, character library, drawers, popups, import controls, message controls, and global document/window handlers.
- Protected exports consumed by Tavern Helper and other extension-compatible modules.
- Performance-sensitive character-list helpers already extracted to `public/scripts/character-list-state.js` and `public/scripts/character-list-render-state.js`.

Safe extraction candidates:

- More pure state-transition helpers around active character/group selection and temporary-chat status.
- Additional character-list render planning helpers that build on the existing render-state boundary.
- Small DOM controller helpers for one bounded panel or toolbar surface when the root element and cleanup can be explicit.
- Request helper wrappers only when they preserve existing URL, body, header, and response contracts.

Do not start with:

- Message rendering or streaming.
- `APP_READY` / startup event ordering.
- `globalThis.SillyTavern`, `eventSource`, or exported symbol narrowing.
- Character-list identity selector changes.
- Main chat workspace controller extraction as a first slice.

Minimum proof for future slices:

- `bun run test:compat` for any compatibility surface.
- Character-list state/render/structure tests for list state, pagination, delete, row identity, or bulk selection.
- Focused Playwright proof for visible chat workspace or message behavior.
- Startup focused tests when `APP_READY`, deferred panels, or startup sequencing changes.

### `public/scripts/world-info.js`

Current responsibilities:

- World-info settings state, selected global worlds, cache, and persistence.
- Prompt activation logic, scanning, insertion positions, timed effects, inclusion groups, recursive behavior, and regex application.
- Editor panel rendering, card collapsed UI, pagination, search, sort, status toggles, import/export, move/copy, delete, and original-data maintenance.
- Character, chat, and auxiliary world-book assignment flows.
- World-info slash-command registration and callbacks.

Main couplings:

- Imports shared shell state from `public/script.js`, including characters, chat metadata, save helpers, active character, and event bridge.
- Uses regex engine placement `WORLD_INFO` and slash-command classes.
- Directly manipulates World Info panel DOM and Select2 widgets.
- Emits and listens for world-info events through `eventSource`.
- Interacts with character card world-book links and chat metadata.

Safe extraction candidates:

- Pure conversion helpers for external lorebook formats and character-book conversion.
- Pure prompt activation sub-helpers that can accept explicit settings and entries instead of reading globals.
- Editor render-plan helpers for sorting, filtering, status labels, and group counts.
- Small panel-controller wrappers for editor menu/search/sort binding after pure helpers are covered.
- Data helpers around world cache reads/writes when request and cache semantics are preserved.

Do not start with:

- Regex matching semantics or placement values.
- World-info slash-command registration.
- Prompt activation recursion and timed-effect behavior without focused unit proof.
- Editor DOM identity or template structure used by existing tests.
- Character-card linked-world cleanup behavior.

Minimum proof for future slices:

- `world-info-card-rendering.test.js` for editor card/template/UI structure.
- `bun run test:compat` before touching regex, extension, slash-command, or world-info regex surfaces.
- Focused unit tests for pure conversion or prompt-activation helpers.
- Playwright proof for user-visible editor workflows when DOM behavior changes.

### `public/scripts/slash-commands.js`

Current responsibilities:

- Root slash-command parser instance and public execution functions.
- Default command registration for chat, character, generation, API connection, variables, macros, group chat, message edits, utility commands, and help.
- Command execution with parser flags, scopes, closures, abort/pause/debug controllers, and command progress UI.
- Slash-command autocomplete setup.
- Integration with regex processing, message insertion, generation state, chat selection/deletion, extension commands, and quick replies.

Main couplings:

- Imports and mutates chat, characters, selected group, generation state, provider settings, tokenizers, macros, background, groups, and prompt-related modules.
- Emits message and chat events through `eventSource`.
- Depends on parser class modules under `public/scripts/slash-commands/`.
- Is a protected `@sillytavern/scripts/slash-commands` import surface.

Safe extraction candidates:

- Pure argument validation helpers.
- Command-group registration modules when each group has a stable dependency object and can be tested independently.
- Execution option normalization helpers.
- Help/category data helpers that do not change public command names or return behavior.

Do not start with:

- Parser grammar or closure execution semantics.
- Public exports: `executeSlashCommands`, `executeSlashCommandsWithOptions`, `getSlashCommandsHelp`, `registerSlashCommand`, and `parser`.
- Command names, aliases, or event side effects.
- Regex placement `SLASH_COMMAND`.
- Tavern Helper compatibility imports.

Minimum proof for future slices:

- `bun run test:compat` for public import/export, regex, or extension-adjacent changes.
- Existing Macro slash-command E2E tests for parser/execution behavior.
- New focused unit tests for extracted pure command helpers.
- Browser proof if command execution changes visible chat input progress, pause, or stop UI.

### `public/scripts/openai.js`

Current responsibilities:

- Chat-completion source settings and provider defaults.
- Prompt and message assembly for chat-completion backends.
- Model selection, reverse proxy, API key, preset, logit-bias, reasoning, verbosity, image request, media inlining, tool calling, and custom parameter UI.
- Provider capability checks and generation parameter creation.
- Slash commands for proxy URL and API key.
- Streaming error parsing and provider-specific request behavior.

Main couplings:

- Reads and writes global API state from `public/script.js`.
- Uses `SecretManager`-backed frontend secret helpers and reverse-proxy settings.
- Integrates with tokenizers, prompt manager, group chats, power-user settings, SSE stream helpers, tool calling, and provider backend routes.
- Binds a large settings DOM surface in `initOpenAI()`.

Safe extraction candidates:

- Provider capability helpers for reasoning, verbosity, media inlining, and model selection.
- Generation-parameter normalization helpers that accept explicit settings and model input.
- Segmented-control synchronization helpers already covered structurally.
- Settings-to-DOM mapping helpers only after preserving existing selectors and save behavior.

Do not start with:

- Secret handling or reverse proxy behavior.
- Provider request body semantics without backend parity tests.
- `chat_completion_sources` enum names.
- `settingsToUpdate` selector contract.
- Model/provider defaults without source-backed provider validation.

Minimum proof for future slices:

- `openai-segmented-controls.test.js` for segmented setting controls.
- `chat-completions-google.test.js` and related backend tests when request shape or provider routing changes.
- Focused unit tests for extracted generation-parameter helpers.
- Source-backed provider documentation check before changing current API syntax, model-specific behavior, or provider capability rules.

### `src/endpoints/characters.js`

Current responsibilities:

- Character card PNG read/write through `character-card-parser.js`.
- `DiskCache` for PNG-to-JSON extraction.
- Character list and single-character payload generation.
- Derived SQLite character index row build, refresh, delete, and fallback integration.
- Character card V1/V2 normalization, character-book conversion, import/export, CharX/Risu/YAML/BYAF paths, avatar crop/resize, thumbnail invalidation and pregeneration.
- Character create, rename, edit, merge, edit-avatar, edit-attribute, delete, list/all/get/chats/import/duplicate/export route handlers.
- Delete preflight world-info metadata discovery.

Main couplings:

- File-backed user directories from `src/users.js`.
- Thumbnail endpoint helpers and derived character index helpers.
- World-info file reads for linked legacy world book conversion.
- Chat aggregate reads through `getChatInfo()` from `src/endpoints/chats.js`.
- Existing path and filename validation middleware.

Safe extraction candidates:

- Pure card-shape helpers: `toShallow`, V1/V2 field mapping, data-size calculation, unset-sentinel processing.
- Derived index maintenance helpers grouped by mutation operation.
- Import-format service functions by source format.
- Route service wrappers for read/list/get that preserve response shape and fallback behavior.
- Delete-preflight world-info metadata helper with explicit directory input.

Do not start with:

- Canonical file storage model.
- `DiskCache` and SQLite semantics in the same slice.
- Route response shapes for `/api/characters/all` and `/api/characters/get`.
- Path validation, thumbnail invalidation, or character index refresh calls around mutations.
- Broad endpoint file split before helper-level tests exist.

Minimum proof for future slices:

- Existing interaction performance index tests for index/list/get behavior.
- `thumbnail-write-time-pregeneration.test.js` for write-time thumbnail side effects.
- Focused route tests for any changed endpoint response or mutation behavior.
- `bun run test:compat` when frontend-visible character-list DOM or exported shell behavior changes as part of a route slice.

### `src/endpoints/chats.js`

Current responsibilities:

- JSONL chat save/load and integrity checking.
- Chat backup throttling, retention, and cleanup.
- Chat import conversion for Ooba, Agnai, CAI Tools, Kobold Lite, Chub, RisuAI, JSON, and JSONL inputs.
- Chat metadata and preview extraction through line streaming.
- Character chat and group chat routes for save/get/rename/delete/export/import/search/recent.
- Character index chat-stat dirty marking after chat mutations.

Main couplings:

- File-backed character and group chat directories from the authenticated user context.
- Backup config from runtime config.
- Character index dirty marking for `chat_size` and `date_last_chat`.
- Path guards and filename sanitization.
- Frontend chat import/export and recent-chat UI contracts.

Safe extraction candidates:

- Import converter functions into a dedicated chat-import helper module (delivered 2026-06-02).
- Backup policy and throttled function cache into a focused backup helper.
- Pure preview and metadata extraction helpers.
- Shared file-path resolution helpers that keep `isPathUnderParent()` validation explicit.
- Search/recent assembly helpers with focused fake-directory tests.

Do not start with:

- JSONL serialization format.
- Integrity-check behavior.
- Backup timing/retention changes.
- Group and character chat route unification without route proof.
- Character-index dirty marking removal or broadening.

Minimum proof for future slices:

- Focused chat endpoint tests for save/get/rename/delete/import/search/recent changes.
- Interaction performance index tests when chat mutations affect character aggregate invalidation.
- Import-format fixture tests before moving converter behavior.
- Express route/order tests if router mounting, middleware, or upload handling changes.

## Recommended First Slices

1. Extract pure character card helper tests from `src/endpoints/characters.js` (delivered 2026-06-02).
   - Candidate helpers: shallow payload shaping, data-size calculation, V1/V2 field mapping, unset sentinel cleanup.
   - Reason: high payoff, no browser compatibility surface, and route services can reuse the helpers later.

2. Extract chat import converter tests from `src/endpoints/chats.js` (delivered 2026-06-02).
   - Candidate helpers: Ooba, Agnai, CAI, Kobold Lite, Chub flattening, and Risu conversion.
   - Reason: current behavior is pure enough to preserve with fixture tests before route splitting.

3. Extract chat backup planning helpers from `src/endpoints/chats.js` (delivered 2026-06-02).
   - Candidate helpers: backup name normalization, backup file path construction, cleanup prefix selection, and total-retention decision.
   - Reason: keeps backup planning testable while preserving route-owned filesystem writes, cleanup order, throttling lifecycle, and save behavior.

4. Extract world-info external format conversion helpers.
   - Candidate helpers: NovelAI/Agnai/Risu/character-book conversions and world-entry normalization.
   - Reason: reduces `world-info.js` size without touching prompt activation or editor DOM first.

5. Extract OpenAI/provider capability helpers.
   - Candidate helpers: reasoning effort normalization, verbosity resolution, media inlining support, model selection by source.
   - Reason: existing focused segmented-control and backend provider tests can be expanded without changing UI binding first.

6. Continue character-list helper extraction inside `public/script.js`.
   - Candidate helpers: state transition and render planning that extend existing `character-list-state.js` and `character-list-render-state.js`.
   - Reason: existing focused tests already guard row identity and incremental reconcile.

## Deferred Targets

Defer these until the smaller helpers above are already covered:

- Main chat workspace controller extraction.
- Message rendering and streaming.
- Slash-command parser or closure execution semantics.
- World-info prompt activation recursion and timed effects.
- Regex engine and regex placement values.
- Extension mount points and `@sillytavern/*` import surfaces.
- Route-level file split for `characters.js` or `chats.js` before service/helper tests exist.
- Any frontend framework, SPA, or TypeScript migration.

## Validation Matrix

| Future Slice | Minimum Validation |
|---|---|
| `public/script.js` character-list helper | `character-list-state.test.js`, `character-list-render-state.test.js`, `character-list-structure.test.js`, `bun run test:compat` when identity/export surfaces are touched |
| `public/script.js` startup/readiness | startup focused tests plus `bun run test:compat` if exported events or globals change |
| World-info editor UI | `world-info-card-rendering.test.js`; Playwright if visible editor behavior changes |
| World-info regex or prompt activation | focused unit tests plus `bun run test:compat` |
| Slash-command helper extraction | Macro slash-command E2E or focused parser/execution tests; `bun run test:compat` for public exports |
| OpenAI settings UI | `openai-segmented-controls.test.js` plus focused DOM tests for changed selectors |
| OpenAI/provider request semantics | `chat-completions-google.test.js` and related backend/provider tests; source-backed provider docs check |
| Character route helper/service | focused unit/route tests plus interaction performance index tests if list/get/index behavior changes |
| Character mutation side effects | thumbnail write-time pregeneration tests and character-index refresh/delete proof |
| Chat route helper/service | focused chat endpoint/import tests; interaction performance index tests when chat aggregate dirty marking changes |
| Express mount/order change | `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand` |
| Semantic docs change | `bun run docs:check` or `bun run docs:build` |

## Related Semantic IDs And Code Binding Points

Related semantic docs:

- `page.chat_workspace`
- `feature.startup_bootstrap`
- `feature.character_library_panel`
- `feature.character_delete`
- `feature.extension_panel_open`
- `feature.world_info_panel`
- `term.shared_browser_library`
- `term.character_card`

Stability-sensitive binding points:

- `public/script.js`
- `public/scripts/world-info.js`
- `public/scripts/slash-commands.js`
- `public/scripts/openai.js`
- `src/endpoints/characters.js`
- `src/endpoints/chats.js`
- `eventSource`
- `event_types`
- `globalThis.SillyTavern`
- `@sillytavern/*`
- `POST /api/characters/all`
- `POST /api/characters/get`
- `POST /api/chats/save`
- `POST /api/chats/rename`
- `POST /api/chats/delete`
- `POST /api/chats/import`
- `<user root>/_cache/character-index.sqlite`

Related implementation docs:

- [frontend-jquery-slice-migration.md](frontend-jquery-slice-migration.md)
- [frontend-shared-library-boundary.md](frontend-shared-library-boundary.md)
- [interaction-performance-indexing.md](interaction-performance-indexing.md)
- [server-startup-orchestration.md](server-startup-orchestration.md)
- [user-module-split.md](user-module-split.md)
- [third-party-extension-compatibility.md](third-party-extension-compatibility.md)

## Phase 1 Outcome

Phase 1 confirms that the next modernization work should proceed from pure helper extraction and focused route/service helpers, not from broad file splits or UI rewrites.

Delivered follow-up:

- 2026-06-02: The first recommended slice extracted the pure character-card helper boundary from `src/endpoints/characters.js` into `src/endpoints/character-card-helpers.js` with direct helper tests. `readFromV2` remains in `characters.js` because its current default and warning behavior is not yet a clean pure-helper boundary.
- 2026-06-02: The second recommended slice extracted chat import converters from `src/endpoints/chats.js` into `src/endpoints/chat-import-converters.js` with fixture-style tests for Ooba, Agnai, CAI Tools, Kobold Lite, Chub JSONL flattening, RisuAI, and JSON converter selection. `/api/chats/import` keeps route-owned upload cleanup, path checks, file writes/copy, response shape, fallback behavior, and chat-stat dirty marking.
- 2026-06-02: The third recommended slice extracted chat backup planning from `src/endpoints/chats.js` into `src/endpoints/chat-backup-helpers.js` with focused tests for backup name normalization, backup path construction, cleanup prefixes, and total-retention boundaries. `backupChat()` keeps route-owned enablement, directory checks, file writes, cleanup calls, throttle map, process-exit flush, and failure logging.

The remaining safest near-term implementation sequence is:

1. World-info conversion helpers.
2. OpenAI/provider capability helpers.
3. Additional character-list state helpers.
4. Character route service wrappers after the delivered helper boundary stays green.

Each later slice should state the compatibility surface it touches, add or identify focused regression proof before behavior moves, and keep file-backed data and browser extension contracts stable.
