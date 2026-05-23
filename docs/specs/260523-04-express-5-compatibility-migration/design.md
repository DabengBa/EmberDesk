# Express 5 Compatibility Migration

## Goal

Move the server from Express 4 to Express 5 while preserving existing route behavior, middleware order, authentication gates, CSRF behavior, static asset serving, upload handling, plugin routes, and WebSocket startup behavior.

## Production-Ready Result

This task is shippable when EmberDesk runs on Express 5, the public and private route surfaces behave as before, and every migration-specific behavior change is either covered by tests or documented as intentionally unchanged product behavior.

## Source Evidence

- `package.json` currently depends on `express ^4.21.0` and `@types/express ^4.17.23`.
- `src/server-main.js` registers security middleware, compression, body parsing, CORS, auth, whitelist, sessions, CSRF, static files, public routes, login wall, proxy, uploads, version, and private routes.
- `src/server-startup.js` registers deprecated redirects, private endpoint setup, HTTP/HTTPS listeners, IPv6 handling, and SSL validation.
- `src/plugin-loader.js` creates plugin routers and mounts them under `/api/plugins/{id}`.
- Express official migration guidance for v5 calls out codemods, removed APIs, route matching changes, response API changes, and static MIME behavior changes.

## Scope

In scope:

- Upgrade Express and directly coupled type/dev metadata.
- Apply Express 5 migration codemods where they match the codebase.
- Fix route path syntax and removed response APIs.
- Verify static file MIME behavior for JavaScript, CSS, HTML, JSON, and uploaded assets.
- Verify error propagation behavior for async route handlers and middleware.
- Keep all product routes and UI behavior unchanged.

Out of scope:

- Reorganizing route modules.
- Changing authentication model.
- Changing CSRF/session semantics.
- Rewriting plugin contracts.
- Node runtime cleanup unless a blocker appears.

## Implementation Plan

1. Run Express 5 migration codemods and review every generated change.
2. Manually audit route declarations for path-to-regexp changes, wildcard behavior, and optional parameter syntax.
3. Audit response calls for deprecated signatures such as old `res.redirect` or `res.send` status ordering.
4. Audit static asset serving for MIME-type changes that affect browser module loading.
5. Verify plugin routers still mount and receive their scoped router.
6. Run unit tests that cover startup, users, settings, characters, plugins, and middleware.
7. Start the server and run Playwright login/setup/chat smoke paths.
8. Record all intentional Express 5 behavior differences in the PR summary.

## Acceptance Criteria

- `express` resolves to Express 5.
- Server startup, login/setup, static assets, private APIs, plugin routing, proxy routing, uploads, and 404 handling still work.
- Unit and E2E tests pass.
- No frontend jQuery/module refactor is included.

## Rollback

Revert the Express 5 migration commit and restore Express 4 dependency metadata. If database or data files were not changed, rollback is dependency and code only.

## Risks And Boundaries

- Route matching differences can silently break wildcard or deprecated endpoint redirects.
- Static MIME differences can break browser module loading even if server tests pass.
- Async error handling may expose previously swallowed errors; treat those as migration findings, not unrelated refactors.

