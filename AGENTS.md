# AGENTS.md

> Project instructions for AI agents working on EmberDesk.

## Project Overview

EmberDesk is a self-hosted browser LLM workspace forked from SillyTavern. The project is in an early transition stage: keep the power-user workflow, simplify inherited complexity, improve performance, and modernize incrementally without abandoning the existing file-backed model.

## Current Stack

| Area | Contract |
|---|---|
| Runtime | Node.js 26.3.0 Current (`>=26.3.0 <27`) |
| Package manager / scripts | Bun 1.3.14 (`packageManager`) |
| Language | JavaScript ES modules |
| Server | Express 5 |
| Frontend | HTML / CSS / jQuery, no SPA framework |
| Build | Webpack for browser shared library output |
| Tests | Jest unit tests and Playwright E2E under `tests/` |
| License | AGPL-3.0 |

## First Reads

- Use `.agents/skills/emberdesk-architecture-map` when the task crosses module boundaries.
- Read `.docs/project-overview.md` and `.docs/PROJECT_HISTORY.md` for durable project direction.
- Read the relevant `.docs/tech/*.md` and `.docs/adr/*.md` before changing accepted architecture.
- Read `.docs/db/pages`, `.docs/db/features`, and `.docs/db/terms` before changing user-visible pages, features, or terms.
- Read `.docs/tech/bun-workflow.md` for Node/Bun/CI boundaries.
- Read `.docs/tech/third-party-extension-compatibility.md` before touching regex, extensions, slash commands, world info regex editing, message rendering, or character-list DOM.

## Key Directories

- `server.js` - process entry point; parses config, sets globals, then imports `src/server-main.js`.
- `src/` - Express server, startup pipeline, middleware, endpoints, user storage/auth, plugins, vectors, utilities.
- `src/endpoints/` - API routers mounted by `setupPrivateEndpoints(app)`.
- `public/` - browser shell, HTML/CSS/jQuery UI, shared library boundary, extensions, macros, slash commands.
- `tests/` - separate Bun package for Jest and Playwright tests.
- `default/` - default config and scaffold content.
- `.docs/` - durable project history, ADRs, tech notes, and semantic doc database.
- `docs/` - shared workflow/environment docs and active design specs.
- `.agents/skills/` - project-specific AI skills for future coding agents.

## Commands

```powershell
bun ci
Push-Location tests; bun ci; Pop-Location
bun run start
bun run start:no-csrf
bun run test:unit
bun run test:compat
bun run test:e2e
bun run docs:check
bun run docs:build
bun run lint
```

Use Node.js 26.3.0 for server release proof by default. Bun is the package manager and script runner, not the default application runtime. Local runs on non-contract Node majors are diagnostic only and do not replace Node.js 26.3.0 validation. `src/electron` remains npm-owned.

## Architecture Rules

- `server.js` is the only normal entry point. It calls `CommandLineParser.parse(process.argv)`, sets `globalThis.DATA_ROOT` and `globalThis.COMMAND_LINE_ARGS`, changes cwd to `serverDirectory`, then imports `src/server-main.js`.
- `src/server-main.js` owns boot orchestration: data initialization, middleware/public routes, private routes, cleanup hooks, request filter/proxy, Webpack compile, error/404 handlers, listen, and post-listen tasks.
- `src/server-startup.js` owns HTTP/HTTPS server creation, IPv4/IPv6 behavior, SSL validation, and listen failures.
- `src/command-line.js` owns config resolution. Keep argv parsing, filesystem prep, and config merge separable and testable.
- `src/users.js` is a compatibility barrel plus middleware/routes. Storage, directories, migrations, and auth live in `src/user-storage.js`, `src/user-directories.js`, `src/user-migrations.js`, and `src/user-auth.js`.
- Canonical user data is file-backed under `dataRoot`. `DiskCache` and `_cache/character-index.sqlite` are derived caches only.
- `public/script.js` is the main browser shell and compatibility surface. Treat `eventSource`, `event_types`, `globalThis.SillyTavern`, and startup ordering as shared contracts.
- `public/lib.js` is both source-import and bundled `/lib.js` compatibility boundary. Normalize package interop inside that file.

## Development Paths

- Local setup, startup, config, Docker: use `.agents/skills/emberdesk-local-dev`.
- Tests, lint, debugging, compatibility gates: use `.agents/skills/emberdesk-testing-debugging`.
- Frontend/UI work: use `.agents/skills/emberdesk-frontend-slice`.
- Backend/API/data work: use `.agents/skills/emberdesk-backend-api-data`.
- Auth, security, secrets, proxies, plugins, providers: use `.agents/skills/emberdesk-security-auth-integrations`.

## Frontend Guardrails

- Do not introduce React, Vue, TypeScript application code, or a SPA framework without explicit approval.
- Preserve page-controller patterns in `public/scripts/login.js` and `public/scripts/setup.js`: pure helpers, `createXController()`, `initXPage()`, dependency injection, and cleanup.
- Preserve character-list identity selectors: `.character_select`, `.group_select`, `.bogus_folder_select`, `data-chid`, legacy `chid`, `id="CharID${chid}"`, `.character_selected`, `.bulk_select_checkbox`, `.tags_inline`, `.ch_fav`.
- Preserve protected extension surfaces and `@sillytavern/*` imports unless a migration plan updates code, docs, and compatibility tests together.
- Run `bun run test:compat` around regex, Tavern Helper / JS-Slash-Runner, extension, slash-command, world-info regex, and character-list DOM work.

## Backend And Security Guardrails

- Preserve Express middleware order unless focused tests prove the new order: security middleware, body parsing, CORS, auth/whitelist/host checks, sessions, CSRF, static/public routes, auth wall, private routes, uploads, error handler, final 404.
- Keep `whitelistMode`, `hostWhitelist`, and `privateAddressWhitelist` distinct. They cover inbound IPs, Host/DNS rebinding, and outbound SSRF protection respectively.
- Keep `requestProxy` distinct from `privateAddressWhitelist`; proxying and SSRF filtering are separate.
- Do not disable CSRF, expose secrets, or loosen proxy/whitelist behavior as a convenience fix.
- Use existing path and filename guards (`sanitize-filename`, `validateAvatarUrlMiddleware`, `getFileNameValidationFunction`, `isPathUnderParent`) instead of ad hoc path logic.
- Use `SecretManager` and exported secret helpers; do not read or write `secrets.json` directly.

## Documentation Rules

- Long-form project documentation belongs under `.docs/` or `docs/`; keep root `AGENTS.md` concise.
- `.docs/db` is the semantic doc database. When user-visible behavior changes, update the owning page/feature/term docs or document why no semantic update is needed.
- Run `bun run docs:check` or `bun run docs:build` after `.docs/db` changes.
- Keep credentials, cookies, session tokens, and exported browser storage out of the repository. `docs/environments.md` documents the remote test server without storing credentials.

## Validation Checklist

- Choose the narrowest focused tests for touched code first.
- For Express route/order changes, run `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand`.
- For config/startup changes, run focused command-line/startup tests.
- For user/auth/storage changes, run the matching `user-*`, login/setup, and E2E tests.
- For frontend compatibility surfaces, run `bun run test:compat`.
- For shared library changes, run `frontend-shared-library-boundary.test.js`.
- For docs database changes, run docs check/build.
- Inspect `git diff` before finishing and do not revert unrelated user changes.

## Things To Avoid

- Do not modify the `release` branch directly.
- Do not add dependencies without a project-specific reason and validation plan.
- Do not change the license.
- Do not delete or rewrite derived documentation/process files unless the owning workflow requires it.
- Do not turn derived caches or indexes into canonical user-data storage.
- Do not clean untracked project files or proactively `git add` untracked files.
