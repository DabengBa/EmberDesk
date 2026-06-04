# EmberDesk Modernization Roadmap

## Module Responsibility

This roadmap records the recommended modernization sequence for EmberDesk. It is a planning document for architecture, implementation order, validation gates, and compatibility boundaries.

It does not redefine user-facing product semantics. User-visible pages, features, and terms remain owned by `.docs/db/`.

## Goals

- Reduce inherited SillyTavern complexity without disrupting power-user workflows.
- Improve startup, character-library, chat-workspace, and settings interaction latency with repeatable evidence.
- Keep canonical user data portable and file-backed.
- Preserve extension, regex, slash-command, shared-library, and character-list DOM compatibility while modernizing in slices.
- Make future changes easier to test by extracting pure helpers, page controllers, route services, and derived-state modules.

## Assumptions

- Node.js 26.3.0 Current (`>=26.3.0 <27`) remains the supported application runtime.
- Bun remains the package manager and script runner, not the default application runtime.
- Express 5 remains the server framework.
- The browser application remains HTML/CSS/jQuery during this roadmap.
- Webpack remains scoped to the `/lib.js` shared browser-library boundary until a replacement proves the same contract.
- SQLite and DiskCache remain derived caches only; file-backed user data remains canonical.

## Open Questions

- Release cadence and maintenance windows are not fixed here.
- Team capacity is not assumed, so phases are dependency-ordered rather than date-ordered.
- A future SPA or TypeScript application migration would require a separate design, ADR, compatibility plan, and user approval.
- A database-first storage model would require a separate migration design and is outside this roadmap.

## Architecture And Constraints

Modernization must follow the existing project boundaries:

- `server.js` stays the normal process entry point.
- `src/server-main.js` stays the boot coordinator.
- `src/command-line.js` owns config resolution.
- `src/server-startup.js` owns transport and listen behavior.
- `src/users.js` remains a compatibility barrel while storage, directories, migrations, and auth stay split into focused modules.
- `public/script.js`, `eventSource`, `event_types`, `globalThis.SillyTavern`, and `@sillytavern/*` browser imports are compatibility surfaces.
- `public/lib.js` keeps the dual source-import and bundled `/lib.js` boundary.
- Character-list row identity selectors and attributes remain stable unless a migration updates code, docs, and compatibility tests together.

Do not modernize by broad renames, framework swaps, route-order rewrites, or storage-source changes.

## Roadmap Steps

### Phase 0: Baseline And Gates

Execution record: [modernization-phase0-baseline.md](modernization-phase0-baseline.md).

1. Establish the current validation baseline.
   - Run focused commands for the touched area before each slice.
   - Keep known unrelated failures documented instead of hiding them behind broad rewrites.
   - Use `bun run test:compat` as the mandatory gate for regex, extension, slash-command, message-rendering, world-info regex, and character-list DOM work.

2. Keep documentation topology healthy.
   - Update `.docs/tech/` for implementation architecture.
   - Update `.docs/db/` only when user-visible pages, features, or terms change.
   - Run `bun run docs:check` or `bun run docs:build` after semantic database changes.

3. Keep performance claims measurable.
   - Use existing startup and interaction runners before claiming a win.
   - Record scenario, profile shape, warm/cold state, and machine-sensitive caveats.

Phase 0 result:

- Whole-repo lint is green after excluding vendored third-party extension build artifacts and fixing first-party lint debt.
- The core modernization gates are green locally: semantic docs, compatibility, Express route/order, shared browser library, startup/config, user/auth/setup/login, character-list focused tests, performance tooling tests, and full unit suite.
- Local proof ran under Node 25.4.0, while the project runtime contract is now Node.js 26.3.0 Current. Treat local results as useful diagnostic evidence, not release proof.
- Full Playwright E2E and performance runners were skipped because Phase 0 did not change user-visible behavior or implement a performance slice.

### Phase 1: Complexity Mapping

Execution record: [modernization-phase1-complexity-map.md](modernization-phase1-complexity-map.md).

1. Classify high-complexity modules by ownership.
   - Frontend shell: `public/script.js`.
   - World info: `public/scripts/world-info.js`.
   - Slash commands: `public/scripts/slash-commands.js`.
   - Provider settings: `public/scripts/openai.js` and related API settings surfaces.
   - Character data routes: `src/endpoints/characters.js`.
   - Chat data routes: `src/endpoints/chats.js`.

2. For each target, define a narrow extraction boundary before editing.
   - Pure decision helpers.
   - State transition helpers.
   - DOM controller or panel controller.
   - Route service or file-backed data helper.
   - Derived-cache helper.

3. Add or identify focused regression proof before moving behavior.
   - Prefer unit tests for pure helpers and route services.
   - Use Playwright for user-visible browser flows.
   - Use compatibility tests before touching shared extension surfaces.

Phase 1 result:

- The critical frontend risk cluster is `public/script.js`, `public/scripts/world-info.js`, and `public/scripts/slash-commands.js`; do not start by splitting these files broadly.
- The high-value backend starting points are `src/endpoints/characters.js` pure card helpers and `src/endpoints/chats.js` chat import/backup helpers. Character card helpers, chat import converters, and chat backup planning helpers are now delivered.
- The safest frontend starting points are world-info external conversion helpers, OpenAI/provider capability helpers, and additional character-list state/render helpers.
- Main chat workspace extraction, message rendering/streaming, slash-command parser semantics, regex placement values, extension mount points, and route-level endpoint file splits remain deferred until smaller helper boundaries are covered.

### Phase 2: Frontend Slice Modernization

1. Continue the page-controller pattern already used by login and setup.
   - Choose small page or panel roots.
   - Export pure helpers.
   - Provide `createXController()` and `initXPage()` or `initXPanel()`.
   - Inject dependencies for focused tests.
   - Use `AbortController` cleanup for listeners and timers.

2. Prioritize safer frontend targets.
   - Static account, setup, recovery, simple settings, and non-extension panels.
   - Isolated dialogs whose request and DOM contracts are already documented.
   - Toolbar or drawer controls that do not touch message rendering or extension loading.

3. Defer high-risk frontend targets until compatibility proof exists.
   - Main chat workspace.
   - Message rendering and streaming.
   - Regex extension internals.
   - Slash-command parser and registration.
   - World-info regex editing.
   - Extension mount points and `@sillytavern/*` imports.

4. Keep UI modernization framework-free for this phase.
   - Use ES modules, pure helpers, delegated local controllers, and native browser APIs.
   - Do not introduce React, Vue, TypeScript application code, or a SPA router.

### Phase 3: Frontend Performance

1. Continue startup critical-path reduction.
   - Move non-first-screen work behind `APP_READY`.
   - Use single-flight loaders for repeated startup, warmup, and panel-open requests.
   - Keep `APP_READY` semantics stable: visible and usable main shell.

2. Expand deferred panel loading carefully.
   - Extract heavy markup into `/panels/*.html`.
   - Add retryable placeholders.
   - Replay already-loaded startup state through registered panel hooks.
   - Keep correctness independent from idle warmup.

3. Expand incremental rendering only where entity identity is stable.
   - Prefer stable keys such as avatar or group id over array index.
   - Keep conservative full-refresh fallback for filtered, ambiguous, bulk-edit, or stale states.
   - Preserve row identity selectors and accessibility state.

4. Continue image and thumbnail work where it gives visible wins.
   - Lazy-load offscreen list avatars.
   - Keep thumbnail caching and pregeneration derived-only.
   - Avoid changing canonical avatar or character-card storage.

### Phase 4: Backend Route And Data Modernization

1. Split large endpoint files by responsibility.
   - Keep routers thin.
   - Move file-backed reads and writes into focused services.
   - Move payload conversion and validation into reusable helpers.
   - Keep route response shapes stable.

2. Continue character and chat hot-path optimization.
   - Keep `DiskCache` for PNG-to-JSON extraction.
   - Keep SQLite character index derived and self-healing.
   - Add derived indexes only for proven hot paths.
   - Never treat derived rows as canonical user data.

3. Preserve server middleware order.
   - Security, parsing, CORS, auth, whitelist, host checks, sessions, CSRF, public routes, auth wall, private routes, uploads, error handler, and final 404 must remain ordered unless focused tests prove a change.

4. Keep path and secret handling centralized.
   - Use existing path guards and filename validation.
   - Use `SecretManager` and exported secret helpers.
   - Do not read or write `secrets.json` directly.

### Phase 5: Build And Dependency Modernization

1. Keep Bun and Node roles separate.
   - Install and run scripts with Bun.
   - Run the application with Node by default.
   - Keep `src/electron` npm-owned until its lifecycle scripts and packaging are deliberately migrated.

2. Keep Webpack until `/lib.js` replacement proof exists.
   - Verify named exports and default export shape.
   - Verify legacy global shims.
   - Verify CommonJS interop such as `slideToggle`.
   - Verify browser bundled output remains importable.

3. Review dependencies by risk and payoff.
   - Prefer removing unused inherited dependencies before adding new ones.
   - Add dependencies only with a project-specific reason and validation plan.
   - Avoid broad dependency churn during behavior-changing slices.

### Phase 6: Compatibility Hardening

1. Treat third-party extension compatibility as a release boundary.
   - Protect extension mount points.
   - Protect `@sillytavern/*` browser import aliases.
   - Protect regex placement numeric values.
   - Protect `eventSource` and `event_types`.

2. Expand compatibility tests when a protected surface is touched.
   - Character-list DOM identity.
   - Shared library shims.
   - Regex exports and placement values.
   - Slash-command and Tavern Helper integration surfaces.

3. Use deprecation cycles for public surface removals.
   - Document the compatibility reason.
   - Add tests for both old and new behavior during the transition.
   - Remove only after an explicit migration plan.

### Phase 7: Documentation And Release Hygiene

1. Keep durable docs current.
   - `.docs/tech/` for implementation structure and constraints.
   - `.docs/adr/` for hard-to-reverse decisions with real trade-offs.
   - `.docs/db/` for user-visible semantics.
   - `.docs/PROJECT_HISTORY.md` for shipped cross-spec evolution, not future plans.

2. Keep root `AGENTS.md` concise.
   - Add only durable, high-level project rules.
   - Link to detailed `.docs/` files instead of duplicating them.

3. Inspect changes before finishing each slice.
   - Use `git diff`.
   - Do not revert unrelated user changes.
   - Do not clean untracked project files.
   - Do not proactively `git add` untracked files.

## Validation Matrix

| Change Surface | Minimum Validation |
|---|---|
| Startup/config | Focused command-line and startup tests |
| Express route/order | `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand` |
| User/auth/storage | Matching `user-*`, login/setup, and relevant E2E tests |
| Frontend compatibility surface | `bun run test:compat` |
| Shared browser library | `bun run test:unit -- frontend-shared-library-boundary.test.js --runInBand` |
| Character-list state/rendering | Character-list state, render-state, and structure tests |
| Performance change | Startup or interaction performance runner with scenario evidence |
| Semantic docs | `bun run docs:check` or `bun run docs:build` |
| Character route helper/service | Focused helper/route tests plus interaction-performance index tests if list/get/index behavior changes |
| Character mutation side effects | Thumbnail write-time pregeneration tests and character-index refresh/delete proof |
| Chat route helper/service | Focused chat endpoint/import/backup-helper tests plus interaction-performance index tests when chat aggregate dirty marking changes |
| World-info conversion or editor UI | Pure helper tests for conversions; `world-info-card-rendering.test.js` and Playwright for visible editor behavior |
| OpenAI/provider capability or request semantics | `openai-segmented-controls.test.js`, provider/backend tests such as `chat-completions-google.test.js`, and source-backed provider docs for API syntax changes |

## Known Execution Gaps

- Node.js 26.3.0 proof remains required before release because the Phase 0 local baseline ran under Node 25.4.0, which is outside the supported engine range and is not a release-proof runtime.
- Full Playwright E2E remains a release or UI-slice gate, not yet part of the Phase 0/1 local proof.
- Startup and interaction performance runners remain required before claiming latency wins.
- Vendored third-party extension artifacts are intentionally excluded from whole-repo lint; do not auto-format or refactor them as first-party source.

## Delivered Modernization Slices

- 2026-06-02: Character card helper boundary delivered. `UNSET_SENTINEL`, `calculateDataSize`, `toShallow`, `unsetPrivateFields`, and `processUnsetSentinels` now live in `src/endpoints/character-card-helpers.js` with focused proof in `tests/character-card-helpers.test.js`. `readFromV2` intentionally remains in `src/endpoints/characters.js` because its current default and warning behavior is not a clean pure-helper boundary.
- 2026-06-02: Chat import converter helper boundary delivered. Ooba, Agnai, CAI Tools, Kobold Lite, Chub JSONL flattening, RisuAI conversion, and JSON converter selection now live in `src/endpoints/chat-import-converters.js` with fixture-style proof in `tests/chat-import-converters.test.js`. `/api/chats/import` continues to own upload cleanup, path checks, file naming, file writes/copy, JSON/JSONL branching, Chub fallback handling, response shape, and chat-stat dirty marking.
- 2026-06-02: Chat backup helper boundary delivered. Backup name normalization, backup file path construction, per-chat cleanup prefix selection, and total-retention policy decisions now live in `src/endpoints/chat-backup-helpers.js` with focused proof in `tests/chat-backup-helpers.test.js`. `backupChat()` continues to own enablement, directory checks, file writes, cleanup calls, throttling lifecycle, and failure logging.
- 2026-06-03: World-info external converter helper boundary delivered. Novel Lorebook, Agnai Memory Book, Risu Lorebook, and embedded Character Book converters now live in `public/scripts/world-info-converters.js` with focused proof in `tests/world-info-converters.test.js`. `public/scripts/world-info.js` continues to own file parsing, overwrite checks, `/api/worldinfo/import`, `saveWorldInfo()`, editor refresh side effects, and the public `convertCharacterBook` re-export used by `@sillytavern/scripts/world-info`.
- 2026-06-03: World-info import feedback delivered. The file import entry now exposes busy/disabled feedback, spinner state, and a persistent loading toast while `importWorldInfo(file)` is active, then restores on success, cancel, parse failure, overwrite denial, or network failure. `importEmbeddedWorldInfo()` now reports when the selected character has no embedded `character_book` data. Converter logic, import API shapes, overwrite decisions, editor rendering, and compatibility exports remain unchanged.
- 2026-06-04: World-info import decision quality delivered. Single-file import now derives detected format and entry count for overwrite confirmation and success feedback, uses action-labeled overwrite confirmation with cancel as the safe default, distinguishes PNG character-card/no-data cases, unsupported formats, oversized uploads, parse failures, and network/import failures, and preserves converter output plus `/api/worldinfo/import` payload shape.
- 2026-06-04: OpenAI/provider capability helper extraction delivered. public/scripts/openai-provider-capabilities.js now owns pure model, reasoning, verbosity, and media-support helpers, while public/scripts/openai.js keeps compatibility wrappers and request assembly. Focused unit tests now exercise structured descriptors and the current helper branches without changing provider UI or payload semantics.

## Recommended Next Work

The next recommended implementation slice after the delivered OpenAI/provider capability helper extraction is character-list helper extraction inside `public/script.js`. That area still has repeated render/state logic that can be isolated without touching the main chat workspace shell or extension surfaces.

Scope:

- Move the file input from first-file-only handling to an explicit multi-file queue.
- Keep detected format, entry count, overwrite confirmation, and actionable per-file errors visible for each import attempt.
- Prevent duplicate submissions while a batch is active and make partial success/failure outcomes clear.
- Keep converter logic, prompt activation, regex placement values, slash-command registration, editor card DOM identity, pagination, and import API shapes stable unless a later design explicitly approves a behavior change.

First shippable target:

1. Add `multiple` input support only after defining explicit per-file sequencing and user feedback.
2. Reuse the current single-file metadata and error-classification helpers for each file.
3. Keep retry UI out unless the same slice defines where retry state lives and how duplicate submissions are prevented.
4. Prove the changes with focused import-flow tests or browser evidence depending on the executable surface available.

Not in this slice:

- Do not change external-format converter output, regex matching semantics, placement values, or slash-command surfaces.
- Do not change prompt activation recursion, timed effects, inclusion-group behavior, editor card templates, DOM identity, pagination, or world-info file schema.
- Do not split the whole world-info module or introduce a framework/controller rewrite.
- Do not change converter output, import API shape, world-info schema, or editor card DOM identity as part of batch import.

Minimum validation:

- New focused proof for detected-format/entry-count display and actionable error branches, or browser proof if no stable unit surface exists.
- `world-info-card-rendering.test.js` and browser proof only if visible editor rendering changes.
- `bun run test:compat` if regex, slash-command, extension, import alias, or world-info regex surfaces are touched.
- `bun run lint` as the closeout gate.

## Recommended Near-Term Sequence

1. Add World Info batch import as a separate UX/API slice.
   - Move from first-file-only handling to an explicit per-file queue after import feedback and conversion boundaries stay green.
   - Keep per-file error reporting and overwrite decisions explicit.

2. Extract OpenAI/provider capability helpers.
   - Start with reasoning effort, verbosity, media inlining, and model-selection helpers.
   - Use source-backed provider docs before changing API syntax, model-specific behavior, or request payload semantics.

3. Continue character-list helper extraction inside `public/script.js`.
   - Extend existing `character-list-state.js` and `character-list-render-state.js` boundaries.
   - Preserve row identity selectors and run compatibility proof when identity/export surfaces are touched.

4. Continue character route service extraction only after the delivered helper boundary stays green.
   - Prefer read/list service wrappers or import-format helpers with route proof.
   - Keep `/api/characters/all`, `/api/characters/get`, cache/index refresh, and thumbnail side effects stable.

5. Pick a low-risk frontend panel or toolbar controller only after the helper slices above are green.
   - Keep the login/setup controller pattern: pure helpers, explicit root, dependency injection, cleanup, and focused proof.

6. Run startup and interaction performance reports after any slice that claims a latency improvement.

7. Update owning docs after each shipped slice, then record only shipped architecture evolution in `.docs/PROJECT_HISTORY.md`.

## Non-Goals

- No SPA migration in this roadmap.
- No TypeScript application migration in this roadmap.
- No database-first canonical storage migration in this roadmap.
- No Bun-as-runtime migration in this roadmap.
- No broad rename or cleanup of public compatibility surfaces.
- No dependency expansion without a specific, validated project payoff.

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

- `server.js`
- `src/server-main.js`
- `src/command-line.js`
- `src/server-startup.js`
- `src/users.js`
- `public/script.js`
- `public/lib.js`
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

- [modernization-phase0-baseline.md](modernization-phase0-baseline.md)
- [modernization-phase1-complexity-map.md](modernization-phase1-complexity-map.md)
- [frontend-jquery-slice-migration.md](frontend-jquery-slice-migration.md)
- [frontend-shared-library-boundary.md](frontend-shared-library-boundary.md)
- [interaction-performance-indexing.md](interaction-performance-indexing.md)
- [third-party-extension-compatibility.md](../../docs/third-party-extension-compatibility.md)

## Performance And Caching

Performance work should stay scenario-driven:

- Startup: reduce work before `APP_READY`; keep readiness semantics stable.
- Character library: avoid full PNG/chat rescans on warm list and safe steady-state get paths.
- Deletion and pagination: prefer incremental reconcile only when stable entity identity makes it safe.
- Images: improve perceived loading with thumbnail cache headers, pregeneration, lazy loading, async decoding, and stable placeholders.

Caching must remain derived and disposable. Cache corruption, missing rows, or unavailable runtime features must degrade to file-backed behavior without breaking user data.
