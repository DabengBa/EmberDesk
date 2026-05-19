# 0003 — Split users.js Into Four Focused Modules

## Context

`src/users.js` grew to ~1244 lines with ~40 exports spanning identity storage (`node-persist` CRUD), per-user filesystem layout, startup migrations, credential verification (including SSO), request middleware, backup generation, and Express route handlers. Ten or more files import from `src/users.js`, many pulling only one or two symbols. The shallow interface meant bugs in one concern were hard to localize because the same file also defined storage, layout, and request behavior.

Two specific friction points:

1. `ENABLE_ACCOUNTS` was a module-level `const` calling `getConfigValue` at import time, which called `process.exit(1)` if the config file path was not yet set — making the module untestable without a real config file.
2. `node-persist` storage functions, SSO login functions, and directory layout functions were all in the same file, so any change to one concern risked touching unrelated code.

## Decision

Split into four modules with an acyclic dependency graph:

- **`user-storage.js`** — `node-persist` CRUD, `toKey`/`toAvatarKey`, `initUserStorage`, `getAllUserHandles`, `getAllEnabledUsers`, `needsSetup`, `getAccountVersion`. Exports `getEnableAccounts()` (lazy config read).
- **`user-directories.js`** — `getUserDirectories`, `getUserDirectoriesList`, `ensurePublicDirectoriesExist`, `cleanUploads`, `getUserAvatar`. Depends on `user-storage.js`.
- **`user-migrations.js`** — `migrateUserData`, `migrateSystemPrompts`, `migratePublicOverrides`. Depends on `user-directories.js`.
- **`user-auth.js`** — `getCookieSecret`, `getPasswordHash`, `getCsrfSecret`, `tryAutoLogin`, SSO login chain. Depends on `user-storage.js`.

`src/users.js` becomes a re-export barrel plus middleware, routes, backup, and security verification. All 10+ existing importers continue importing from `src/users.js` unchanged.

`ENABLE_ACCOUNTS` is replaced by `getEnableAccounts()` — a lazy function with first-call cache — to avoid the `process.exit(1)` at import time.

## Why

The four modules map to the actual responsibility clusters found in the code:

- **Storage** (~80 lines): pure `node-persist` operations, no Express or filesystem dependency
- **Directories** (~150 lines): filesystem layout under `DATA_ROOT/<handle>/`, depends on storage for `getAllUserHandles`
- **Migrations** (~300 lines): three self-contained migration functions with different idempotency mechanisms (marker file, `existsSync`, destination check)
- **Auth** (~200 lines): crypto, SSO, session management, depends on storage for `getItem` lookups

The barrel re-export pattern preserves backward compatibility: no importer changes needed, no intermediate adapter layer, no deprecation period.

The lazy `getEnableAccounts()` pattern was chosen over eager `const` because `getConfigValue` calls `process.exit(1)` when `CONFIG_PATH` is unset. Making it lazy allows the module to be imported before the config pipeline runs (needed for testability).

## Consequences

- Each module is independently testable: pure functions in `user-storage.js` need no mocks; `getUserDirectories` needs only `globalThis.DATA_ROOT`; migrations need a temp filesystem.
- The dependency graph is acyclic: `user-storage` ← `user-directories` ← `user-migrations`, `user-storage` ← `user-auth`, `users.js` ← all four.
- `STORAGE_KEYS` is duplicated across `user-storage.js` and `user-auth.js` (each module owns its own key subset). This is acceptable because the keys are string constants with no shared mutable state.
- `User`, `UserViewModel`, and `UserDirectoryList` typedefs remain in `users.js` for JSDoc consumers — they are documentation-only with no runtime impact.
- 22 new tests cover the extracted modules (7 storage + 9 auth + 5 directories + 1 migrations).
