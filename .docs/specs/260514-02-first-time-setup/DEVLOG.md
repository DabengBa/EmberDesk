# DEVLOG: First-Time Setup Page

## 2026-05-14 — Initial Delivery

### What Changed

New EmberDesk deployments with `enableUserAccounts: true` (the default) now show a one-time setup page at `/setup` that requires creating a password-protected admin account. Previously, the default user was created without a password and auto-login gave immediate workspace access.

### Why

Passwordless auto-login on first launch was a security gap. The setup page ensures every deployment starts with a credential-protected admin account.

### User-Visible Behavior

- **Fresh deploy**: visiting `/` redirects to `/setup`. The operator enters a handle, optional display name, and password. After submission, they are logged in and taken to the workspace.
- **Post-setup**: `/setup` redirects to `/login`. Normal login flow applies.
- **Existing deploy**: no change. Users already exist, so the setup page is never shown.
- **Password recovery**: unchanged. `recover.js` CLI and the login page recovery flow continue to work.

### Technical Summary

**Files modified:**
- `src/users.js`: `initUserStorage()` no longer creates DEFAULT_USER when `enableUserAccounts` is true. Added `needsSetup()` and `setupPageMiddleware()`.
- `src/server-main.js`: `/` route checks `needsSetup()` before auth redirect. Mounted `/setup` route.
- `src/endpoints/users-public.js`: Added `POST /api/setup` endpoint with input validation, slugify, user creation, directory initialization, and session establishment.
- `src/middleware/basicAuth.js`: Added `@deprecated` JSDoc (part of auth merge).
- `default/config.yaml`: `enableUserAccounts` default set to `true`. Basic Auth marked as legacy.
- `.docs/db/pages/login.md`: Updated config section, marked Basic Auth as deprecated.

**Files created:**
- `public/setup.html`: Setup page HTML matching login page card style.
- `public/scripts/setup.js`: Client-side form handling, validation, CSRF, password toggle.
- `.docs/db/pages/setup.md`: Doc ID `page.setup`.
- `.docs/db/features/first-time-setup.md`: Doc ID `feature.first_time_setup`.

### Doc ID Changes

| ID | Type | Status |
|---|---|---|
| `page.setup` | page | Created |
| `feature.first_time_setup` | feature | Created |

### Design Decisions

1. **No DEFAULT_USER when accounts enabled**: Storage starts empty. `needsSetup()` checks for zero users. Simpler than creating-then-deleting a placeholder.
2. **Password required**: No passwordless accounts through setup. The form validates password presence client-side and server-side.
3. **No rate limiting on setup**: The endpoint only works when zero users exist (fresh deploy, typically localhost). Not exploitable on established deployments.

### Related Work

This feature is part of the authentication system consolidation that merged `basicAuthMode` into `enableUserAccounts` as the sole primary auth mechanism. `basicAuthMode` is retained as a legacy global restriction for backward compatibility.
