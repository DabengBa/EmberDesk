---
description: "User responsibilities are split into directly imported native TypeScript modules for storage, authentication, session, routes, files and backup."
kind: technical
topic: user-module-split
---

# User Module Split

## Module Responsibility

The original `src/users.js` was first split into four focused modules while retaining a barrel. The remaining middleware, routes, security and backup have since moved to native TypeScript modules; the barrel is removed and callers import their owners directly.

Primary files:

- `src/user-security.ts`, `src/user-session.ts`, `src/user-pages.ts` — security checks, session middleware, auth page middleware
- `src/user-files.ts`, `src/user-backup.ts`, `src/user-types.ts` — user file router, backup export, shared types
- `src/user-storage.ts` — `node-persist` CRUD and user record queries
- `src/user-directories.ts` — per-user filesystem layout and directory creation
- `src/user-migrations.ts` — startup data migrations
- `src/user-auth.ts` — credential verification, SSO, session crypto

## Architecture And Constraints

The user-facing owners import the existing shared modules directly:

```
user-security.ts / user-session.ts / user-pages.ts / user-files.ts / user-backup.ts
  ├── user-auth.ts
  │     └── user-storage.ts
  ├── user-directories.ts
  │     └── user-storage.ts
  ├── user-migrations.ts
  │     └── user-directories.ts
  └── user-storage.ts
```

Constraints:

- Account route implementations import their shared helpers directly. `src/server-main.ts` imports `src/endpoints/users-public-routes.ts` directly; `src/server-startup.ts` imports `src/endpoints/users-private-routes.ts` and `src/endpoints/users-admin-routes.ts` directly.
- Path traversal protection (`isPathUnderParent` + `path.resolve`) remains in the file handlers in `src/user-files.ts`.
- `node-persist` storage is initialized once via `initUserStorage()` in `user-storage.ts`. SSO login functions in `user-auth.ts` access `storage.getItem()` directly.

### Lazy config reads

`getEnableAccounts()` in `user-storage.ts` uses lazy evaluation (first-call cache) instead of a module-level `const`. It reads configuration only on first use, after configuration initialization in the normal startup path.

## Core Implementation

### user-storage.ts

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

### user-directories.ts

| Symbol | Type | Notes |
|---|---|---|
| `getUserDirectories(handle)` | function | Maps `USER_DIRECTORY_TEMPLATE` under `DATA_ROOT/<handle>/`, with cache |
| `getUserDirectoriesList()` | async | Calls `getAllUserHandles()` then `getUserDirectories()` for each |
| `ensurePublicDirectoriesExist()` | async | Creates `PUBLIC_DIRECTORIES` + all user directories |
| `cleanUploads()` | function | Clears `UPLOADS_DIRECTORY` |
| `getUserAvatar(handle)` | async | Reads avatar from storage or filesystem |

### user-migrations.ts

| Symbol | Type | Notes |
|---|---|---|
| `migrateUserData()` | async | One-time `public/` → per-user data root migration |
| `migratePublicOverrides()` | async | Moves legacy `public/error/` and `public/css/user.css` overrides into `DATA_ROOT/_errors/` and `DATA_ROOT/_css/`; existing targets are retained along with their sources |

The migration preserves its existing file and SQLite ordering; it does not provide an atomic cross-store recovery transaction.
If `public/characters` was moved before a later settings migration failure, the next startup skips `migrateUserData()` even if the settings source remains; manual recovery may be needed.

### user-auth.ts

| Symbol | Type | Notes |
|---|---|---|
| `getCookieSecret(dataRoot)` | function | Reads/generates cookie secret |
| `getPasswordSalt()` | function | `crypto.randomBytes(16)` |
| `getCookieSessionName()` | function | Hostname-based session name |
| `getSessionCookieAge()` | function | Config-driven session timeout |
| `getPasswordHash(password, salt)` | function | `crypto.scryptSync` |
| `getCsrfSecret(request)` | function | Per-user CSRF secret |
| `shouldRedirectToLogin(request)` | function | Guard predicate |
| `tryAutoLogin(request)` | async | Orchestrator: single-user, Authelia, Authentik |

## Related Semantic IDs And Code Binding Points

The user module split has no user-facing semantic ID. Related semantic docs:

- `page.login` — covers the login page, not the auth module internals
- `feature.login_submit` — covers login form submission
- `page.setup` — covers first-time setup page
