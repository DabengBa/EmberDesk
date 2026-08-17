# AGENTS.md

> Project instructions for AI agents working on EmberDesk.

## Project Overview

EmberDesk is a self-hosted browser LLM workspace forked from SillyTavern. The project is in an early transition stage: keep the power-user workflow, simplify inherited complexity, improve performance, and modernize incrementally without abandoning the existing file-backed model.

## Current Stack

| Area | Contract |
|---|---|
| Runtime | Node.js 24.16.0 Current (`>=24.16.0 <25`) |
| Package manager / scripts | pnpm 12.0.0-rc.5 (`packageManager`) |
| Language | JavaScript ES modules (server `src/`) + TypeScript (frontend `app/`) |
| Server | Express 5 |
| Frontend | React 19 + TanStack Router/Query/Form + Zustand + Zod on a Vite-built app; legacy `public/` HTML/CSS/jQuery shell retained for not-yet-migrated surfaces |
| Build | Vite 8 for `/lib.js`, React page app, and guarded React panel bundles |
| Tests | Jest unit tests and Playwright E2E under `tests/` |
| License | AGPL-3.0 |

## First Reads

- Read `.docs/project-overview.md` and `.docs/PROJECT_HISTORY.md` for durable project direction.
- Read the relevant `.docs/tech/*.md` and `.docs/adr/*.md` before changing accepted architecture.
- Read `.docs/db/pages`, `.docs/db/features`, and `.docs/db/terms` before changing user-visible pages, features, or terms.
- Read `.docs/tech/pnpm-workflow.md` for Node/pnpm/CI boundaries.
- Read `.docs/tech/third-party-extension-compatibility.md` before touching regex, extensions, slash commands, world info regex editing, message rendering, or character-list DOM.

## Key Directories

- `server.js` - process entry point; parses config, sets globals, then imports `src/server-main.js`.
- `src/` - Express server, startup pipeline, middleware, endpoints, user storage/auth, plugins, vectors, utilities.
- `src/endpoints/` - API routers mounted by `setupPrivateEndpoints(app)`.
- `public/` - browser shell, HTML/CSS/jQuery UI, shared library boundary, extensions, macros, slash commands.
- `tests/` - separate pnpm package for Jest and Playwright tests.
- `default/` - default config and scaffold content.
- `.docs/` - durable project history, ADRs, tech notes, and semantic doc database.
- `docs/` - shared workflow/environment docs and active design specs.

## Commands

```bash
pnpm install --frozen-lockfile
(cd tests && pnpm install --frozen-lockfile)
pnpm run build:lib              # Vite 构建 (主构建)
pnpm run build:react            # React page app
pnpm run build:react:character-library
pnpm run build:react:workspace-panels
pnpm run start
pnpm run start:no-csrf
pnpm run test:unit
pnpm run test:component
pnpm run test:integration
pnpm run test:compat
pnpm run test:e2e
pnpm run test:all
pnpm run test:inventory
pnpm run docs:check
pnpm run docs:build
pnpm run lint
```

Use Node.js 24.16.0 for server release proof by default. pnpm is the package manager and script runner; `src/electron` is an independent pnpm package boundary.

## Architecture Rules

- `server.js` is the only normal entry point. It calls `CommandLineParser.parse(process.argv)`, sets `globalThis.DATA_ROOT` and `globalThis.COMMAND_LINE_ARGS`, changes cwd to `serverDirectory`, then imports `src/server-main.js`.
- `src/server-main.js` owns boot orchestration: data initialization, middleware/public routes, private routes, cleanup hooks, request filter/proxy, Vite frontend library serve, error/404 handlers, listen, and post-listen tasks.
- `src/server-startup.js` owns HTTP/HTTPS server creation, IPv4/IPv6 behavior, SSL validation, and listen failures.
- `src/command-line.js` owns config resolution. Keep argv parsing, filesystem prep, and config merge separable and testable.
- `src/users.js` is a compatibility barrel plus middleware/routes. Storage, directories, migrations, and auth live in `src/user-storage.js`, `src/user-directories.js`, `src/user-migrations.js`, and `src/user-auth.js`.
- Canonical user data is file-backed under `dataRoot`. `DiskCache` and `_cache/character-index.sqlite` are derived caches only.
- `public/script.js` is the legacy browser shell and compatibility surface for not-yet-migrated surfaces. Treat `eventSource`, `event_types`, `globalThis.SillyTavern`, and startup ordering as shared contracts there. Migrated surfaces are owned by the TypeScript React app under `app/` (see ADR-0012).
- `public/lib.js` is both source-import and bundled `/lib.js` compatibility boundary. Normalize package interop inside that file.

## Frontend Guardrails

- Per ADR-0012 (Accepted 2026-07-16), React is the **sole runtime owner** of already-migrated surfaces: `/login`, `/setup`, `/settings`, Character Library + Character/Group Authoring, World Info, Background Library, Extensions Host, and the same-entry workspace shell with its guarded main-chat island. Do not reintroduce legacy `public/login.html` / `public/setup.html` controllers or otherwise keep a parallel legacy implementation alive; roll back by deploying a prior version. Shared helpers remain in `public/scripts/login-shared.js` and `public/scripts/setup-shared.js`.
- Frontend `app/` is TypeScript + React 19 using the standard stack: TanStack Router, TanStack Query, TanStack Form, Zustand, and Zod. Do not broaden Vue, SPA-framework rewrites, or a separate `/workspace-next` route beyond the ADR-0012 scope without explicit approval. ADR-0012 does **not** authorize a broad SPA rewrite of the entire `public/` shell.
- The legacy `public/` HTML/CSS/jQuery shell is retained only for surfaces not yet migrated under ADR-0012. Treat `eventSource`, `event_types`, `globalThis.SillyTavern`, and startup ordering as shared contracts there.
- Preserve character-list identity selectors: `.character_select`, `.bogus_folder_select`, `data-chid`, legacy `chid`, `id="CharID${chid}"`, `.character_selected`, `.bulk_select_checkbox`, `.tags_inline`, `.ch_fav`.
- Preserve protected extension surfaces and `@sillytavern/*` imports unless a migration plan updates code, docs, and compatibility tests together.
- Run `pnpm run test:compat` around regex, Tavern Helper / JS-Slash-Runner, extension, slash-command, world-info regex, and character-list DOM work.

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
- Run `pnpm run docs:check` or `pnpm run docs:build` after `.docs/db` changes.
- Keep credentials, cookies, session tokens, and exported browser storage out of the repository. `.docs/tech/hostinger-sttest-deployment.md` documents the Hostinger sttest server without storing credentials.

## Validation Checklist

- Choose the narrowest focused tests for touched code first.
- For Express route/order changes, run `pnpm --dir tests run test:unit -- express5-route-compatibility.test.js --runInBand`.
- For config/startup changes, run focused command-line/startup tests.
- For user/auth/storage changes, run the matching `user-*`, login/setup, and E2E tests.
- For frontend compatibility surfaces, run `pnpm run test:compat`.
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
