# User Module Split

## Module Responsibility

This document covers the split of `src/users.js` (~1244 lines, ~40 exports) into four focused modules for identity, filesystem layout, migrations, and auth. `src/users.js` is retained as a re-export barrel plus middleware/routes.

Primary files:

- `src/users.js` — re-export barrel, middleware, routes, backup, security verification
- `src/user-storage.js` — `node-persist` CRUD and user record queries
- `src/user-directories.js` — per-user filesystem layout and directory creation
- `src/user-migrations.js` — startup data migrations
- `src/user-auth.js` — credential verification, SSO, session crypto

## Architecture And Constraints

The split follows a layered dependency graph with no back-edges:

```
users.js (barrel + middleware + routes)
  ├── user-auth.js
  │     └── user-storage.js
  ├── user-directories.js
  │     └── user-storage.js
  ├── user-migrations.js
  │     └── user-directories.js
  └── user-storage.js
```

Constraints:

- `src/users.js` re-exports all symbols from the four new modules. Existing importers (`server-main.js`, `server-startup.js`, `basicAuth.js`, `recover-password.js`, `settings.js`, `stats.js`, `characters.js`, `users-public.js`, `users-private.js`, `users-admin.js`) continue importing from `src/users.js` unchanged.
- Path traversal protection (`isPathUnderParent` + `path.resolve`) remains in `createRouteHandler` and `createExtensionsRouteHandler` in `users.js`.
- `node-persist` storage is initialized once via `initUserStorage()` in `user-storage.js`. SSO login functions in `user-auth.js` access `storage.getItem()` directly.

### Lazy config reads

`getEnableAccounts()` in `user-storage.js` uses lazy evaluation (first-call cache) instead of a module-level `const`. This avoids `process.exit(1)` at import time when the config file path has not been set yet (needed for testability).

## Core Implementation

### user-storage.js

| Symbol | Type | Notes |
|---|---|---|
| `KEY_PREFIX` | const | `'user:'` |
| `getEnableAccounts()` | function | Lazy config read, cached after first call |
| `toKey(handle)` | function | `user:<handle>` |
| `toAvatarKey(handle)` | function | `avatar:<handle>` |
| `initUserStorage(dataRoot)` | async | Calls `storage.init()`, creates default user if accounts disabled |
| `needsSetup()` | async | Checks storage state for first-run |
| `getAllUserHandles()` | async | `storage.keys()` with prefix filter |
| `getAllEnabledUsers()` | async | Filters enabled users |
| `getAccountVersion(user)` | function | Hash of handle+password+salt for session invalidation |

### user-directories.js

| Symbol | Type | Notes |
|---|---|---|
| `getUserDirectories(handle)` | function | Maps `USER_DIRECTORY_TEMPLATE` under `DATA_ROOT/<handle>/`, with cache |
| `getUserDirectoriesList()` | async | Calls `getAllUserHandles()` then `getUserDirectories()` for each |
| `ensurePublicDirectoriesExist()` | async | Creates `PUBLIC_DIRECTORIES` + all user directories |
| `cleanUploads()` | function | Clears `UPLOADS_DIRECTORY` |
| `getUserAvatar(handle)` | async | Reads avatar from storage or filesystem |

### user-migrations.js

| Symbol | Type | Notes |
|---|---|---|
| `migrateUserData()` | async | One-time `public/` → per-user data root migration |
| `migrateSystemPrompts()` | async | Per-user `instruct/` → `sysprompt/` migration with `.migrated` marker |
| `migratePublicOverrides()` | async | System-wide `public/error/` → `DATA_ROOT/_errors/` migration |

Each migration is self-contained with its own idempotency mechanism.

### user-auth.js

| Symbol | Type | Notes |
|---|---|---|
| `getCookieSecret(dataRoot)` | function | Reads/generates cookie secret |
| `getPasswordSalt()` | function | `crypto.randomBytes(16)` |
| `getCookieSessionName()` | function | Hostname-based session name |
| `getSessionCookieAge()` | function | Config-driven session timeout |
| `getPasswordHash(password, salt)` | function | `crypto.scryptSync` |
| `getCsrfSecret(request)` | function | Per-user CSRF secret |
| `shouldRedirectToLogin(request)` | function | Guard predicate |
| `tryAutoLogin(request, basicAuthMode)` | async | Orchestrator: single-user, Authelia, Authentik, basic |

## Related Semantic IDs And Code Binding Points

The user module split has no user-facing semantic ID. Related semantic docs:

- `page.login` — covers the login page, not the auth module internals
- `feature.login_submit` — covers login form submission
- `page.setup` — covers first-time setup page
