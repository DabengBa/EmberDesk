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

## Migrated slices

`src/endpoints/chat-backup-helpers.ts` is the sole backup-planning
implementation. `src/endpoints/chats.js` imports it explicitly. The existing
deterministic helper tests keep their unit classification; native import
and actual chat-router module tests provide integration proof. The naming,
retention rules, synchronous API, and backup data format are preserved.

## Chat import and route helpers

The next slice migrates `chat-import-converters.ts`, `chat-import-service.ts`,
and `chat-route-service.ts`, in that order. Each replaces its JavaScript
implementation. `chats.js` imports the typed import planner, and
`canonical-chat-query-service.js` imports the typed matcher and preview helper.
All consumers use the actual `.ts` extension; there is no JavaScript shim.

The import planner describes success/failure and atomic-write/copy-upload
results with discriminated unions. Directory and chat-info types reuse
`UserDirectoryList` and `ChatInfo`. External JSON stays `unknown`; local format
views describe the original unchecked field reads. They are not validators.
The accepted input shapes, converter selection order, synchronous exceptions,
JSONL handling, upload cleanup, search rules, sorting and filesystem tolerance
remain unchanged.

Existing converter/planner unit tests and route/canonical-query integration
tests cover behavior. The native test above also executes the three real
TypeScript modules and imports the actual chats and canonical-query consumers
without a loader, verifying that the mixed JavaScript/TypeScript graph resolves
in Node independently of Jest.

## Character read and write services

`src/endpoints/character-read-service.ts` and
`src/endpoints/character-write-service.ts` now own the existing character
read and write flows. Their exported types describe service options,
dependency ports, canonical outcomes, and projection repairs. The character
router and text-replace service use explicit `.ts` imports; their dependency
factories and import callbacks consume these types through JSDoc. The import
coordinator remains JavaScript and uses the existing route callbacks.

The migration preserves canonical availability and strict errors, conditional
card replacement, authority-commit/projection/repair ordering, and upload
cleanup. Focused read/write, replacement, import, and route tests cover those
behaviors. `character-services-native.test.js` imports the real service and
caller graphs in Node without a loader. `character-services-types.test.js`
checks typed consumers and rejects invalid write and replacement contracts;
it does not enable checking for all legacy JavaScript.

This is internal execution and type-checking work. It changes no user-facing
page, feature, or term, so no semantic documentation database update is needed.

## User storage and configuration leaves

`src/user-storage.ts` and `src/config-init.ts` are the sole implementations of
their existing modules. Their JavaScript callers use explicit `.ts` imports;
`src/users.js` retains its compatibility exports and exposes the storage
module's `User` type through JSDoc. Account key prefixes, SHAKE256 account
versions, lazy account configuration, default-user/setup behavior, deprecated
configuration migrations, environment coercion, and lodash default merging
retain their existing behavior. Types describe the existing trusted values;
this migration adds no runtime validation or data format.

`tests/user-config-native.test.js` runs the actual modules and JavaScript
consumers in isolated Node subprocesses with accounts both enabled and
disabled. It initializes temporary configuration and node-persist storage,
checks account/setup behavior and the version fixture, and imports the
pre-start configuration script with a temporary cwd. No loader, emitted
server code, or listening server is used. The existing user/config suites
also run directly against the production TypeScript files through the shared
Jest adapter.
