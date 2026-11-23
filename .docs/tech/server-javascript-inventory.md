---
description: "A source-backed inventory of the remaining server JavaScript, its callers, runtime entry points, and TypeScript migration boundaries."
kind: technical
topic: server-javascript-inventory
---

# Server JavaScript inventory

**Current status:** The 57 tracked `src/` JavaScript modules inventoried below
have since migrated to strict native TypeScript, including a split of
`src/users.js` into directly imported `user-*.ts` modules. The tables below
are a historical baseline, not a list of current JavaScript files. The root
`server.js`, browser JavaScript and external plugin boundaries remain JS.
The server TypeScript project no longer enables `allowJs` or `checkJs`; see
[server TypeScript](server-typescript.md) for the current checking boundary.

This inventory started at `9657b8179ed088dba38b474169f5c347902f07fe` (68 JavaScript files and 82 TypeScript files under `src/`). Before the first retirement wave there were 68 JavaScript files and 100 TypeScript files. After removing three retired modules and eight pure forwarders there are **57 JavaScript files and 100 TypeScript files** under `src/`. Counts are snapshots, not measures of type safety or route coverage.

The review traced repository imports and direct execution paths, including
dynamic imports, and inspected the route assembly and representative tests.
The callers below are examples, not an exhaustive graph. External server
plugins and deployment scripts are outside that graph; absence of an in-repo
caller does not establish that a module is safe to remove. “Retain” means the
observed caller or contract needs consideration, not that the implementation
must remain JavaScript forever.

## Runtime and route boundaries

`server.js` parses configuration, sets globals and changes the working directory
before dynamically importing `src/server-main.ts`. That module establishes
middleware and calls `src/server-startup.ts`, which mounts routers including
JavaScript modules. TypeScript route assembly is not proof that every mounted
handler is TypeScript:

- `src/endpoints/chats.js` builds the router and shared context; its read,
  write, import and export registrations delegate to TypeScript modules.
- `src/endpoints/characters.js` owns registration, middleware order,
  dependencies and import coordination; `character-*-routes.ts` supplies
  handlers for the migrated slices.
- Startup imports the TypeScript public, private and admin user routers, World Info, settings, presets, and chat completions directly. The archive helper also has a direct TypeScript import. Their former JavaScript forwarders have been removed.
- `src/endpoints/secrets.js` owns `SecretManager` and creates the TS router; `src/endpoints/content-manager.js` owns downloaders and creates its TS router. These modules have runtime responsibilities beyond forwarding exports.
- The old character-index, derived-cache SQLite, and workspace React flag modules have been removed. This does not change canonical SQLite, user data, or React ownership.

Node.js `>=26.13.1 <27` executes erasable TypeScript directly, with actual
relative file extensions and no server emit or production loader.
`tsconfig.server.json` is strict for TypeScript, but uses `allowJs: true` and
`checkJs: false`; it does **not** strictly type-check the retained JavaScript.
See [Server TypeScript](server-typescript.md) for the execution and test
contract. Jest or TypeScript checking alone cannot prove native Node resolution.

The session middleware precedes CSRF protection in `src/server-main.ts`.
The token is held in the session, issued via `/csrf-token`, and read from the
`x-csrf-token` request header. The `/proxy/` exception applies only when the
CORS proxy is enabled; disabling CSRF is a separate, unsafe configuration.
SQLite authority and projection/repair ordering remain storage contracts;
`SecretManager` remains the secrets access boundary. This inventory makes no
change to any of those contracts or to public/private authentication order.

## Direct and dynamic entry points

- `package.json` starts `server.js`, with `--global` for `start:global`, and
  runs `src/server-init.ts` for init. Docker starts `server.js --listen` via
  `docker/docker-entrypoint.sh`; `docker/docker-compose.yml` executes
  `src/healthcheck.ts`.
- `recover.js` dynamically imports `src/recover-password.js`.
- When enabled, `src/plugin-loader.js` discovers external plugin entry points,
  dynamically imports their file URLs, and mounts plugin routes under
  `/api/plugins/<id>`. Plugins are disabled by default; their imports cannot be
  enumerated from this repository. These server plugins are distinct from the
  browser jQuery plugins being retired.
- Other in-repo dynamic imports include `src/charx.js` importing canonical
  backend and media write service, `src/endpoints/coordinate-workspace-write.js`
  importing the replacement coordinator, `src/endpoints/thumbnails.js` and
  `src/users.js` importing canonical media/avatar readers, and
  `src/server-main.ts` importing `open`. Changes to paths must account for the
  branches in which these imports execute.

## File-by-file review

Each row identifies the purpose, a representative caller or execution path,
and the reason to retain or separately investigate it. Paths are relative to
the repository root. “Historical candidate” explicitly does not authorize
deletion.

### Storage, formats and coordination

| File | Purpose, caller and disposition |
| --- | --- |
| `src/byaf.js` | BYAF parsing for `src/endpoints/characters.js` imports. Retain while that import flow uses it. |
| `src/canonical-avatar-blobs.js` | Canonical avatar blob references and maintenance; used by character and canonical TS services. Retain the storage contract. |
| `src/canonical-backend.js` | Canonical slice backend initialization; used by storage routes and TS services. Active mixed-language boundary. |
| `src/canonical-import-ledger.js` | Import ledger, candidate classification and drift; used by shadow imports, canonical services and character routing. Active storage boundary. |
| `src/canonical-sqlite-rollout-contract.js` | Slice rollout flags and rollback-blocking contract; used by registry, operator and shadow imports. Retain behavior and callers. |
| `src/character-library-change-observer.js` | Character-library change observer and singleton; used by `src/server-main.ts` and `src/endpoints/character-library-events.js`. Retain shared identity. |
| `src/character-replace-write-coordinator.js` | Coordinates workspace writes and replace intents; used by routes and `scripts/character-replace-recovery.mjs`. Retain recovery and ordering. |
| `src/charx.js` | CharX parsing and managed asset persistence; used by `src/endpoints/characters.js`, with dynamic canonical imports. Retain import behavior. |
| `src/constants.js` | Shared constants; used by startup, accounts, endpoints and scripts. Retain shared contract. |
| `src/image-processing.js` | Image and avatar conversion; used by character, content and thumbnail paths and the canonical operator. Retain image behavior. |
| `src/storage-feature-flags.js` | Canonical storage flag access; used by registry, shadow imports and write coordination. Retain rollout behavior. |
| `src/users.js` | User/auth middleware, user-data router and compatibility exports; used by startup and many routes and services. Active boundary, not merely a re-export. |
| `src/util.js` | Shared server utilities; used by startup, endpoints, storage and scripts. Active high-fan-out dependency. |

### Startup, operations and other helpers

| File | Purpose, caller and disposition |
| --- | --- |
| `src/express-route-compat.js` | OAuth callback and CORS proxy route compatibility; used by `src/server-main.ts`. Retain route semantics. |
| `src/fetch-patch.js` | Fetch patch with initialization side effects; imported by `src/server-main.ts`. Retain load ordering. |
| `src/healthcheck.js` | Heartbeat-file health check executed by `docker/docker-compose.yml`. Direct operational entry, not an unused module. |
| `src/interaction-performance-report.js` | Interaction performance reports; used by `scripts/interaction-performance-runner.mjs`. Retain tooling caller. |
| `src/performance-report.js` | Startup performance reports; used by `scripts/startup-performance-runner.mjs`. Retain tooling caller. |
| `src/plugin-loader.js` | Optional server plugin discovery, initialization, routes and cleanup; used by `src/server-main.ts`. Retain external plugin contract. |
| `src/plugin-updater.js` | Server plugin updates; used by `src/plugin-loader.js`. Retain plugin lifecycle. |
| `src/prompt-converters.js` | Prompt format conversions; used by chat-completions and tokenizer endpoints. Retain model-facing behavior. |
| `src/react-login-feature.js` | React login base path; used by `src/server-main.ts`. Retain routing contract. |
| `src/recover-password.js` | Account recovery implementation; dynamically imported by `recover.js`. Retain operational entry. |
| `src/server-directory.js` | Server directory resolution; used by `server.js`, startup and healthcheck. Retain direct entry support. |
| `src/server-events.js` | Server event emitter and names; used by `src/server-main.ts`. Retain event identity and order. |
| `src/server-init.js` | Initial configuration setup; run by the package init script and Docker entrypoint. Retain direct entry. |
| `src/server-startup-profiler.js` | Startup phase profiling; used by `src/server-main.ts`. Retain measurement integration. |
| `src/validation-gate-selector.js` | Selects validation gates from changed paths; used by `scripts/validation-gate-selector.mjs`. Retain engineering tooling. |

### Endpoints and route helpers

| File | Purpose, caller and disposition |
| --- | --- |
| `src/endpoints/assets.js` | Asset listing, download and deletion routes; mounted by `src/server-startup.ts` and used by `src/endpoints/files.js`. Active. |
| `src/endpoints/backups.js` | Chat backup routes; mounted by startup and uses chat code. Active. |
| `src/endpoints/character-card-helpers.js` | Character card field helpers; used by character JS and TS modules. Active shared implementation. |
| `src/endpoints/character-file-snapshot.js` | Character-file snapshots and chat statistics; used by character, chat and canonical import/operator paths. Active. |
| `src/endpoints/character-library-events.js` | Character-library event handler; used by `src/endpoints/characters.js`. Active. |
| `src/endpoints/character-replace-coordination.js` | Replacement coordination routes; mounted by startup. Active. |
| `src/endpoints/characters.js` | Character router, middleware, dependencies and import coordination; mounted by startup and delegates slices to TS handlers. Active assembly and implementation. |
| `src/endpoints/chats.js` | Chat router/context, projection and shared support; mounted by startup and used by backup and replacement paths. Active assembly and implementation. |
| `src/endpoints/content-manager.js` | Content types, presets, downloaders and content-import router assembly; used by startup and content consumers. Active implementation plus TS router. |
| `src/endpoints/coordinate-workspace-write.js` | Workspace write and intent middleware; used by character, chat and world-info routes. Active coordination. |
| `src/endpoints/files.js` | File naming, upload, deletion and validation routes; mounted by startup. Active. |
| `src/endpoints/health.js` | HTTP health route; mounted by public endpoint setup. Distinct from the heartbeat CLI. |
| `src/endpoints/image-metadata.js` | Thumbnail dimensions and animation format detection; used by `src/endpoints/thumbnails.js`. Active helper. |
| `src/endpoints/images.js` | Image upload, listing, directories and deletion routes; mounted by startup. Active. |
| `src/endpoints/openai.js` | OpenAI-related routes including model listing; mounted by startup. Active. |
| `src/endpoints/secrets.js` | `SecretManager`, secret operations and TS router creation; used by startup, authentication and model routes. Active secrets boundary. |
| `src/endpoints/settings-cache.js` | Directory and world-info list caches; used by content and world-info routes. Active. |
| `src/endpoints/thumbnails.js` | Thumbnail routes, generation and invalidation; used by startup and character routes, including dynamic avatar reads. Active. |
| `src/endpoints/tokenizers.js` | Tokenizer initialization, encode and decode routes; mounted by startup. Active. |

### Middleware

| File | Purpose, caller and disposition |
| --- | --- |
| `src/middleware/accessLogWriter.js` | Access logging; used by `src/server-main.ts` when listening. Retain configuration behavior. |
| `src/middleware/basicAuth.js` | Basic authentication; used by `src/server-main.ts`. Retain security and ordering. |
| `src/middleware/cacheBuster.js` | Static and character cache invalidation; used by startup and character routes. Active. |
| `src/middleware/errorHandler.js` | Express error handler; used by `src/server-main.ts`. Retain error semantics and ordering. |
| `src/middleware/multerMonkeyPatch.js` | Upload object compatibility; installed by `src/server-main.ts` after multer. Retain ordering. |
| `src/middleware/react-login-serve.js` | React login build detection and static serving; used by startup and `src/users.js`. Active. |
| `src/middleware/userCss.js` | User CSS serving; used by `src/server-main.ts`. Active. |
| `src/middleware/validateFileName.js` | Filename and avatar validation; used by character, chat, settings and TS routes. Active security boundary. |
| `src/middleware/vite-lib-serve.js` | Vite library asset serving; used by `src/server-main.ts`. Active. |

## Verification limits

This is a static review, not evidence that browser flows, runtime behavior or
every external plugin were tested. Existing focused evidence for future changes
includes `tests/server-startup-native.test.js`,
`tests/account-secrets-content-http-native.test.js`,
`tests/chat-backup-native.test.js`, `tests/network-security-native.test.js`,
and the canonical storage integration suites. Select tests based on the actual
change and run a real Node 26 production graph without a loader when changing
module boundaries. The inventory itself does not change product behavior.
