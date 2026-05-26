---
name: emberdesk-architecture-map
description: Navigate EmberDesk architecture before coding. Use when a task needs entry points, server startup phases, module ownership, semantic docs, ADRs, protected compatibility boundaries, or a safe first-read path for refactors and bug fixes.
---

# EmberDesk Architecture Map

Use this first when the request is architectural, cross-cutting, or unclear. Build the answer from repo facts, then switch to a narrower skill for implementation.

## Read First

- `AGENTS.md` for project-wide rules and current command contract.
- `.docs/project-overview.md` and `.docs/PROJECT_HISTORY.md` for durable architecture decisions.
- `.docs/adr/*.md` before changing accepted boundaries.
- `.docs/tech/server-startup-orchestration.md`, `.docs/tech/config-resolution.md`, `.docs/tech/user-module-split.md`, `.docs/tech/plugin-loader-lifecycle.md` for server structure.
- `.docs/tech/frontend-jquery-slice-migration.md`, `.docs/tech/frontend-shared-library-boundary.md`, `docs/third-party-extension-compatibility.md` for frontend modernization boundaries.
- `.docs/db/pages`, `.docs/db/features`, `.docs/db/terms` when a user-visible page, feature, or term changes.

## Mental Model

- `server.js` is the process entry point. It parses CLI/config, sets `globalThis.DATA_ROOT` and `globalThis.COMMAND_LINE_ARGS`, changes cwd to `serverDirectory`, then imports `src/server-main.js`.
- `src/server-main.js` is the boot coordinator: data init, middleware/static/public routes, private endpoint registration, cleanup handles, request filter/proxy, Webpack compile, error/404 handlers, listen, post-listen tasks.
- `src/server-startup.js` owns HTTP/HTTPS creation, IPv4/IPv6 detection, SSL validation, and listen failures.
- `src/server-startup.js` and `src/command-line.js` should stay independently testable; avoid moving config resolution into route or middleware code.
- `src/users.js` is both a compatibility barrel and a middleware/router owner. Storage, directories, migrations, and auth live in `src/user-storage.js`, `src/user-directories.js`, `src/user-migrations.js`, and `src/user-auth.js`.
- `public/script.js` is the main browser shell and compatibility surface. It wires shared libraries, extensions, slash commands, macros, settings, characters, tokenizers, feature modules, and `APP_READY`.
- Canonical user data is file-backed under `dataRoot`; SQLite and disk caches are derived acceleration only.

## Workflow

1. Identify the task surface: server boot, config, auth, API/data, frontend shell, page controller, extension compatibility, docs, CI, or deployment.
2. Use CodeGraph for symbols, callers, callees, and impact. Use `rg --files` or `rg -n` only for literal text, config, tests, and docs.
3. Read the owning `.docs/tech` or ADR before changing established boundaries.
4. If a change affects a user-visible page/feature/term, check `.docs/db` and plan `bun run docs:check` or `bun run docs:build`.
5. Choose the narrowest implementation skill:
   - local startup or CI: `emberdesk-local-dev`
   - validation or failures: `emberdesk-testing-debugging`
   - frontend UI: `emberdesk-frontend-slice`
   - server/data APIs: `emberdesk-backend-api-data`
   - auth/security/external services: `emberdesk-security-auth-integrations`

## High-Risk Boundaries

- Do not introduce React, Vue, TypeScript app code, or a SPA framework without explicit approval.
- Do not treat derived caches as canonical data sources.
- Do not rename or narrow `public/lib.js`, `eventSource`, `event_types`, `@sillytavern/*` browser module surfaces, regex placement values, or character-list identity selectors as incidental cleanup.
- Do not reorder server middleware casually; auth, CSRF, static/public routes, private routes, uploads, error handling, and final 404 have tests and production semantics.
- Do not conflate `whitelistMode`, `hostWhitelist`, and `privateAddressWhitelist`; they protect different directions and threat surfaces.

## Validation

- For docs-only architecture updates: run `bun run docs:check` or `bun run docs:build` when `.docs/db` changed, then inspect `git diff`.
- For startup/config changes: run focused tests such as `bun run --cwd tests test:unit -- command-line.test.js server-startup-profiler.test.js --runInBand`.
- For Express route ordering: run `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand`.
- For compatibility-sensitive frontend changes: run `bun run test:compat`.
