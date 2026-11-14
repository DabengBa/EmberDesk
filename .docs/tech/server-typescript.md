---
description: "Server TypeScript runs directly on Node 26 with erasable syntax and explicit file extensions; separate NodeNext checking and a shared Jest strip adapter support incremental migration."
kind: technical
topic: server-typescript
---

# Server TypeScript

## Runtime and module boundary

The supported runtime is Node.js 26.12.1 (`>=26.12.1 <27`). The server uses
Node native type stripping for `.ts` modules. `pnpm start` still runs
`node server.js`; no server emit, runtime loader, or frontend build is needed
to execute a migrated module. The entry point still parses configuration,
sets globals, changes cwd, then dynamically imports `src/server-main.js`.

Server modules use ESM and the actual on-disk extension in every relative
import: `.ts` for migrated modules and `.js` for retained JavaScript. Use
`import type` for type-only dependencies. Node does not resolve frontend
aliases or extensionless relative imports and does not read tsconfig paths.
Do not write a future emitted `.js` path for a source `.ts` module.

Only erasable syntax is supported: type annotations, interfaces, type aliases,
and type-only imports. Enums, parameter properties, and other constructs that
require TypeScript code generation are outside this execution path. Browser
TSX stays in the existing Vite pipeline.

## Type checking and lint

`tsconfig.server.json` is independent of the frontend configuration. It uses
NodeNext module resolution, ES2022 and Node types, `strict`, `noEmit`,
`allowImportingTsExtensions`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`.
Its roots include `src/**/*`, `server.js`, and `index.d.ts`, which supplies
the existing server globals and Express/session augmentations.

Existing JavaScript remains `allowJs: true`, `checkJs: false`. Migrated
TypeScript receives strict checking; this does not make all legacy server
JavaScript type checked. The root tsconfig selects public/app/index.d.ts
instead of broadly selecting src and root JavaScript. Real cross-boundary
imports and JSDoc types can still bring server declarations into that graph;
exclude rules do not cut transitive imports.

```bash
pnpm run typecheck
pnpm run lint
pnpm start
```

The existing typecheck runs both frontend and server projects. Lint keeps
ESLint for JavaScript, uses the installed oxlint for TypeScript under src,
then runs both typechecks. There is no second compiler or server artifact.

## Jest and native Node proof

Jest 29 VM modules do not use Node native stripping automatically. The
existing Jest configurations declare `.ts` as ESM and transform only `.ts`
through `tests/helpers/jest-strip-typescript.cjs`. It and the existing
frontend helper share `strip-typescript.cjs`, a single wrapper around
`node:module` `stripTypeScriptTypes` with `mode: strip`. No source map, module
rewrite, configuration framework, or separate cache is added. Stripping keeps
original file identity and line numbers for ESM mocks and exceptions. The
transformer supplies Jest's cache key with its own source, the shared helper's
source, and the Node version alongside the input and Jest configuration. This
invalidates cached output after either implementation changes, including when
direct Jest runs or a fixed test root reuse the same cache directory.

Server tests import the original module directly. They do not use
`loadTsModule`, whose temporary graph still serves frontend aliases and
extensionless imports. Test entry files remain `.test.js`, preserving lane
discovery and classification by actual dependencies.

Jest is not the Node resolver: it can accept an extensionless relative
import that Node rejects. TypeScript can also resolve a `.js` specifier to
a `.ts` source for checking. Type checking or a Jest pass alone therefore
does not prove native runtime resolution. Use actual extensions and focused
Node execution for migrated module graphs. The runtime suite records this
difference instead of silently fixing imports.

```bash
pnpm --dir tests run test:integration server-typescript-config.test.js server-typescript-runtime.test.js chat-backup-native.test.js canonical-chat-route-authority.test.js --runInBand
pnpm --dir tests run test:unit chat-backup-helpers.test.js generation-lifecycle-service.test.js character-sort-late-mount.test.js --runInBand
```

The config suite invokes the real compiler in isolated temporary projects.
Runtime fixtures run the same mixed JavaScript/TypeScript static and dynamic
graph in native Node and Jest, verify ESM mocks and original error locations,
and exercise unsupported syntax and invalid specifiers. Node subprocesses
run without a production loader or emitted graph.

## First migrated slice

`src/endpoints/chat-backup-helpers.ts` is the sole backup-planning
implementation. `src/endpoints/chats.js` imports it explicitly. The existing
deterministic helper tests keep their unit classification; native import
and actual chat-router module tests provide integration proof. The naming,
retention rules, synchronous API, and backup data format are preserved.

This is internal execution and type-checking work. It changes no user-facing
page, feature, or term, so no semantic documentation database update is needed.
