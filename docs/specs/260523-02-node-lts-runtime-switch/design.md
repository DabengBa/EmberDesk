# Node LTS Runtime Switch

## Goal

Move EmberDesk from the open-ended `node >= 20` declaration to the current supported LTS runtime target for production use. For 2026 planning, the target is Node 24 LTS unless an implementation-time dependency audit proves a blocker. This step keeps application behavior unchanged while making the supported runtime explicit.

## Production-Ready Result

This task is shippable when EmberDesk installs, starts, builds, and passes the existing test surface on the target LTS runtime, while retaining a clearly documented lower-support decision if temporary compatibility with an older LTS is required.

## Source Evidence

- `package.json` currently declares `"node": ">= 20"`.
- `package.json` includes startup scripts for Node, Bun, Deno, Electron, and no-CSRF mode.
- `tests/package.json` runs Jest through `node --experimental-vm-modules`.
- `src/electron/package.json` is a separate optional desktop wrapper and must be audited for embedded Node/Electron compatibility.
- Node.js official release data identifies Node 24 as Active LTS in 2026 and Node 20 as outside the preferred support window.

## Scope

In scope:

- Update runtime documentation and `engines.node` to the chosen LTS support range.
- Update CI and local setup references that pin or imply Node 20.
- Audit direct runtime-sensitive APIs used by startup, filesystem, WebSocket, crypto, fetch, streams, and test execution.
- Update Node type packages only when required by the current JavaScript tooling.
- Verify Electron remains optional and does not silently define the server runtime.

Out of scope:

- Removing old Node compatibility branches.
- Rewriting Jest or Playwright.
- Express 5 migration.
- Frontend script refactors.

## Implementation Plan

1. Confirm the target runtime using the Node.js official release schedule at implementation time.
2. Update `package.json` `engines.node` to the selected production range, for example `>=24 <25` if the project chooses a strict active-LTS policy.
3. Audit CI and setup docs for Node 20 references and update only the runtime requirement text.
4. Run dependency installation on the target Node version.
5. Run `npm run test:unit --` and resolve runtime-only failures without changing product behavior.
6. Start the server with the baseline config and confirm HTTP startup, static assets, sessions, CSRF, uploads, and WebSocket initialization still work.
7. Run `npm run test:e2e --`.
8. Record the target Node version and any temporarily retained compatibility choice in the delivery notes.

## Acceptance Criteria

- `package.json` declares the intended production runtime support range.
- The app starts from `server.js` on the target LTS.
- Unit tests pass on the target LTS.
- Playwright tests pass on the target LTS.
- No Express, route, frontend, or Webpack modernization is bundled into this task.

## Rollback

Revert the runtime declaration and CI/setup edits. Because behavior changes are not expected in this step, rollback should not require route or UI changes.

## Risks And Boundaries

- Native or WASM-heavy dependencies such as tokenizer, image, and vector libraries may expose runtime-specific installation issues.
- Jest ESM execution may behave differently on newer Node versions.
- A strict `>=24 <25` range reduces ambiguity but can block users who still run Node 22; that trade-off must be explicit in the PR summary.

