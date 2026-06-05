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
- Historical Phase 0 proof ran under Node 25.4.0, while the project runtime contract is now Node.js 26.3.0 Current. Treat those historical results as useful diagnostic evidence, not release proof.
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

- Node.js 26.3.0 release validation proof now exists for the current modernization surfaces: root lint, tests lint, compatibility, semantic docs check, shared browser library, character route/index, Express route order, startup/config, user/auth/login/setup, and the full unit suite.
- Full Playwright E2E remains conditional. The 2026-06-05 release validation sweep skipped Playwright because the validation scope changed no visible browser behavior; run affected E2E when a later slice changes a primary browser flow, page structure, CTA sequencing, or visible UI behavior.
- Startup and interaction performance runners remain required before claiming latency wins.
- Vendored third-party extension artifacts are intentionally excluded from whole-repo lint; do not auto-format or refactor them as first-party source.

## Delivered Modernization Slices

- 2026-06-02: Character card helper boundary delivered. `UNSET_SENTINEL`, `calculateDataSize`, `toShallow`, `unsetPrivateFields`, and `processUnsetSentinels` now live in `src/endpoints/character-card-helpers.js` with focused proof in `tests/character-card-helpers.test.js`. `readFromV2` intentionally remains in `src/endpoints/characters.js` because its current default and warning behavior is not a clean pure-helper boundary.
- 2026-06-02: Chat import converter helper boundary delivered. Ooba, Agnai, CAI Tools, Kobold Lite, Chub JSONL flattening, RisuAI conversion, and JSON converter selection now live in `src/endpoints/chat-import-converters.js` with fixture-style proof in `tests/chat-import-converters.test.js`. `/api/chats/import` continues to own upload cleanup, path checks, file naming, file writes/copy, JSON/JSONL branching, Chub fallback handling, response shape, and chat-stat dirty marking.
- 2026-06-02: Chat backup helper boundary delivered. Backup name normalization, backup file path construction, per-chat cleanup prefix selection, and total-retention policy decisions now live in `src/endpoints/chat-backup-helpers.js` with focused proof in `tests/chat-backup-helpers.test.js`. `backupChat()` continues to own enablement, directory checks, file writes, cleanup calls, throttling lifecycle, and failure logging.
- 2026-06-03: World-info external converter helper boundary delivered. Novel Lorebook, Agnai Memory Book, Risu Lorebook, and embedded Character Book converters now live in `public/scripts/world-info-converters.js` with focused proof in `tests/world-info-converters.test.js`. `public/scripts/world-info.js` continues to own file parsing, overwrite checks, `/api/worldinfo/import`, `saveWorldInfo()`, editor refresh side effects, and the public `convertCharacterBook` re-export used by `@sillytavern/scripts/world-info`.
- 2026-06-03: World-info import feedback delivered. The file import entry now exposes busy/disabled feedback, spinner state, and a persistent loading toast while `importWorldInfo(file)` is active, then restores on success, cancel, parse failure, overwrite denial, or network failure. `importEmbeddedWorldInfo()` now reports when the selected character has no embedded `character_book` data. Converter logic, import API shapes, overwrite decisions, editor rendering, and compatibility exports remain unchanged.
- 2026-06-04: World-info import decision quality delivered. Single-file import now derives detected format and entry count for overwrite confirmation and success feedback, uses action-labeled overwrite confirmation with cancel as the safe default, distinguishes PNG character-card/no-data cases, unsupported formats, oversized uploads, parse failures, and network/import failures, and preserves converter output plus `/api/worldinfo/import` payload shape.
- 2026-06-04: World-info batch import delivered. The import entry now accepts multiple selected files and dropped files, filters unsupported formats, caps batch size, pre-scans conflicts, offers skip/overwrite/ask-per-conflict choices, processes files sequentially through the existing single-file importer, supports cancel-remaining, and summarizes imported/failed/skipped/unprocessed results without changing converter output, world-info schema, editor card DOM identity, or `/api/worldinfo/import` payload shape.
- 2026-06-04: World-info batch import review hardening delivered. Batch import now keeps result objects factory-owned, reports conflict pre-scan fallback to the user, uses a named busy-state option instead of positional `arguments`, exposes More-menu actions as keyboard-operable menu items, localizes new batch/overwrite feedback in `zh-cn`, and shows a checking-target progress state while overwrite confirmation is pending instead of claiming the file is already imported.
- 2026-06-04: OpenAI/provider capability helper extraction delivered. `public/scripts/openai-provider-capabilities.js` now owns pure model, reasoning, verbosity, and media-support helpers, while `public/scripts/openai.js` keeps compatibility wrappers and request assembly. Focused unit tests now exercise structured descriptors and the current helper branches without changing provider UI or payload semantics.
- 2026-06-04: Node 26.3.0 runtime contract delivered. The project runtime is Node.js 26.3.0 Current (`>=26.3.0 <27`), Bun remains the package manager and script runner, and local non-26 proof is diagnostic only. The workstation shell now resolves `node` to `v26.3.0`, so the blocker is no longer toolchain availability but rerunning the gates under the supported runtime.
- 2026-06-04: Derived SQLite sidecar helper foundation delivered. `src/derived-cache-sqlite.js` now owns reusable derived SQLite lifecycle, PRAGMA setup, status reporting, schema reset, dispose, and reset-threshold behavior, while the character index keeps business rules and canonical file-backed behavior. Focused proof lives in `tests/derived-cache-sqlite.test.js`.
- 2026-06-04: oxlint fast-lane preflight delivered. Root `bun run lint:fast` now runs `oxlint src public *.js` with `.oxlintrc.json` preserving the existing ESLint ignored-path boundary. `bun run lint` remained the authoritative ESLint gate, and `bun run --cwd tests lint` was left as the known red baseline for the follow-up ESLint flat-config slice.
- 2026-06-04: ESLint 10 flat config upgrade delivered. Root and tests linting now use `eslint.config.js` / `tests/eslint.config.js`, legacy `.eslintrc.cjs` files are retired, tests own their Jest and Playwright lint plugins directly, `bun run lint` and `bun run --cwd tests lint` both pass, and `bun run lint:fast` remains a non-authoritative oxlint preflight.
- 2026-06-05: Node 26.3.0 release validation sweep completed. The working shell reported `node v26.3.0`, `npm 11.16.0`, `npx 11.16.0`, and Bun 1.3.14. Root lint, tests lint, compatibility, semantic docs check, shared-library proof, character route/index proof, Express route-order proof, startup/config proof, user/auth/login/setup proof, and the full unit suite passed under Node 26.3.0; the full unit suite covered 63 suites and 689 tests. Playwright was intentionally skipped because this validation scope changed no visible browser behavior.
- 2026-06-05: Character-list page-slice helper delivered. `getCharacterListPageEntities()` now lives in `public/scripts/character-list-render-state.js`, preserving current `snapshot.entities` slicing semantics while leaving jQuery pagination, DOM patching, row identity, `CHARACTER_PAGE_LOADED`, and extension compatibility owned by `public/script.js`.
- 2026-06-05: Chat route search/recent service delivered. `src/endpoints/chat-route-service.js` now owns deterministic `/api/chats/search` and `/api/chats/recent` assembly, including character/group/root chat discovery, query matching, pinned sorting, metadata flag propagation, and corrupt/missing-file skips. `src/endpoints/chats.js` keeps Express response handling, JSONL parsing through `getChatInfo()`, save/rename/delete/import/export response shapes, backup lifecycle, and chat-stat dirty marking.
- 2026-06-05: Derived cache release hardening evidence closed. No code behavior changed; the release-risk matrix is covered by focused proof for unsupported `node:sqlite`, `force_off`, startup status, cache path guards, PRAGMA baseline, schema-version reset, corrupt DB rebuild, reset-threshold disable, keyed dispose, character-read filesystem fallback, circuit-disabled throw behavior, and `/api/characters/get` index refresh failures.
- 2026-06-05: Background panel controller boundary delivered. `public/scripts/background-panel-controller.js` now owns root-scoped loading-state helper behavior for the background library panel, while `public/scripts/backgrounds.js` keeps request flow, upload/delete/rename/folder behavior, thumbnail handling, slash-command registration, selectors, and visible copy unchanged. Focused proof lives in `tests/background-panel-controller.test.js`.
- 2026-06-05: Compatibility hardening pass delivered. `tests/third-party-extension-compatibility.test.js` now freezes slash-command public exports in addition to extension mount points, Tavern Helper assets, `@sillytavern/*` aliases, key module exports, event values, regex placement values, and character-list row identity. `tests/interaction-performance-index.test.js` now verifies character read-service envelope fields stay internal to the route layer.
- 2026-06-05: Build dependency closure delivered. Node.js 26.3.0 remains the application runtime, Bun 1.3.14 remains package manager/script runner, Webpack remains scoped to `/lib.js`, ESLint remains the authoritative lint gate, oxlint remains a warning-only fast preflight, and no package, lockfile, build, Docker, or Electron lifecycle drift required a code change.
- 2026-06-05: Documentation topology closure delivered. `.docs/tech/briefs/README.md` now indexes retained closure briefs as persistent intent records, and this roadmap now distinguishes durable briefs from spec-local `design.md`/`plan.md` process artifacts that are deleted during wrap-up. `.docs/db` semantics were unchanged and `bun run docs:check` stayed green.

## Recommended Next Work

The next recommended implementation slice is roadmap freeze and successor decision. Documentation topology closure is complete, so the useful move is to mark this 10-step roadmap closed and move remaining large migrations into an explicit successor proposal instead of leaving them as unfinished work.

Decision for the next turn:

- Start from `.docs/specs/260605-11-roadmap-freeze-successor-decision`.
- Freeze this modernization roadmap only against delivered facts already recorded in `.docs/PROJECT_HISTORY.md`, briefs, and owning tech docs.
- Move future SPA, TypeScript, database-first storage, broad endpoint splits, and broad dependency migrations into successor-roadmap language instead of treating them as unfinished items here.
- Preserve compatibility and file-backed canonical storage boundaries as explicit successor constraints.

Scope:

- Decide the closure state of this roadmap using delivered slice evidence.
- Update this roadmap and owning docs with successor boundaries and non-goals.
- Avoid inventing new implementation work during freeze.

First shippable target:

1. Compare delivered slices in `.docs/PROJECT_HISTORY.md` with the 10-step closure plan.
2. Mark what is closed, what remains intentionally deferred, and what must move to a successor roadmap.
3. Update durable docs without changing product semantics.
4. Run docs validation and close the final spec process files.

Not in this slice:

- Do not implement deferred migrations.
- Do not re-open delivered slices unless current evidence contradicts their closure.
- Do not delete briefs or semantic docs as a way to make the roadmap look finished.

Minimum validation:

- Commands named by the 11 plan.
- `bun run docs:check`.
- `bun run lint` as the closeout gate.

## Recommended Near-Term Sequence

1. Run build/dependency closure.
   - Confirm package boundaries and current tool versions.
   - Keep dependency churn out unless the spec has a specific, validated reason.

2. Then run the Node 26 release validation sweep.
   - Use Node.js 26.3.0 proof as release evidence, not non-contract diagnostic runtimes.
   - Keep the login/setup controller pattern: pure helpers, explicit root, dependency injection, cleanup, and focused proof.

3. Run startup and interaction performance reports after any slice that claims a latency improvement.

4. Update owning docs after each shipped slice, then record only shipped architecture evolution in `.docs/PROJECT_HISTORY.md`.

## 10-Step Roadmap Closure Plan

If the remaining modernization roadmap must close in exactly 10 shippable steps, use this order. Each step starts with a small process `design.md`, runs through `delivery-workflow`, preserves compatibility proof, and records durable facts only after the slice is delivered.

Durable user intent for these steps lives in `.docs/tech/briefs/260605-02-character-route-service-extraction.md` through `.docs/tech/briefs/260605-11-roadmap-freeze-successor-decision.md`. Spec-local `design.md` and `plan.md` files are process artifacts and are deleted as each slice completes wrap-up.

1. Character route service extraction.
   - Extract one deterministic helper or service boundary from `src/endpoints/characters.js`.
   - Keep `/api/characters/all`, `/api/characters/get`, cache/index refresh, thumbnail side effects, path guards, and file-backed canonical storage stable.

2. Character route performance proof.
   - Run focused route/helper tests plus `interaction-performance-index.test.js` and the interaction performance runner where the slice claims latency impact.
   - Record cold/warm state, Node version, data shape, and any degraded fallback.

3. Chat route service extraction.
   - Delivered 2026-06-05: continue from delivered chat import and backup helper boundaries into one route-adjacent search/recent service slice.
   - Preserve save, rename, delete, import, backup, and chat-stat dirty marking response shapes.

4. Derived cache release hardening.
   - Delivered 2026-06-05: confirm SQLite sidecar status, fallback, reset threshold, and schema reset behavior across current character-index usage.
   - Keep derived-cache corruption or unavailability recoverable through file-backed behavior.

5. Low-risk frontend controller slice.
   - Pick one non-extension, non-message-rendering panel or toolbar root and apply the login/setup controller pattern.
   - Keep the main chat workspace, message rendering, slash-command parser, regex internals, and extension mount points out of scope.

6. Compatibility hardening pass.
   - Expand or refresh focused tests around protected character-list DOM identity, shared-library exports, regex placement values, slash-command surfaces, and `@sillytavern/*` import aliases.
   - Treat any public-surface removal as a separate migration, not cleanup.

7. Build and dependency closure.
   - Keep Bun as package/script runner and Node as application runtime.
   - Audit Webpack `/lib.js` boundary, oxlint fast-lane status, ESLint authority, and dependency drift without broad churn.

8. Release validation sweep.
   - Run the current release gate under Node.js 26.3.0: lint, tests lint, docs build/check, compatibility, focused startup/config, route-order, shared-library, user/auth/setup/login, and full unit suite.
   - Run Playwright E2E only for release or UI slices where the route changed visible browser behavior.

9. Documentation and topology closure.
   - Remove stale process docs, keep only high-signal briefs, and ensure `.docs/PROJECT_HISTORY.md`, owning `.docs/tech/`, `.docs/adr/`, and `.docs/db/` docs agree.
   - Run docs validation and inspect semantic topology for unresolved or orphaned nodes.

10. Roadmap freeze and successor decision.
    - Mark this modernization roadmap closed only after delivered slices, validation evidence, and durable docs agree.
    - Move any remaining SPA, TypeScript, database-first, or broad endpoint split ideas into a successor roadmap or ADR-backed proposal instead of treating them as unfinished work in this roadmap.

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
- [third-party-extension-compatibility.md](third-party-extension-compatibility.md)

## Performance And Caching

Performance work should stay scenario-driven:

- Startup: reduce work before `APP_READY`; keep readiness semantics stable.
- Character library: avoid full PNG/chat rescans on warm list and safe steady-state get paths.
- Deletion and pagination: prefer incremental reconcile only when stable entity identity makes it safe.
- Images: improve perceived loading with thumbnail cache headers, pregeneration, lazy loading, async decoding, and stable placeholders.

Caching must remain derived and disposable. Cache corruption, missing rows, or unavailable runtime features must degrade to file-backed behavior without breaking user data.
