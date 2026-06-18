---
id: feature.first_time_setup
type: feature
name: First-Time Setup
related: [page.setup, page.login, feature.login_submit]
---

# Feature: First-Time Setup

## ID 解释

`feature.first_time_setup` represents the one-time account hardening flow that runs before EmberDesk allows normal workspace access. It covers setup detection, the redirect to the setup page, fresh admin account creation, the legacy single passwordless-user password setup path, and the transition to the authenticated workspace. It does not cover subsequent logins, multi-user management, or password recovery.

## Feature Purpose

This feature ensures that every deployment reaches a password-protected account state before normal use, eliminating the security gap of passwordless auto-login.

## Trigger Entry

- **Automatic entry**: visiting any route when `enableUserAccounts` is true and storage either has no users or has exactly one user without a password.
- **Direct entry**: navigating to `/setup` (redirects to `/login` if setup is already complete).
- **Legacy rollback entry**: navigating to `/setup.html` always opens the legacy setup page for rollback testing or operator fallback.

## Interaction IDs

- `feature.first_time_setup`: the full setup lifecycle.
- `feature.first_time_setup.detect`: the server-side detection that triggers the setup redirect.
- `feature.first_time_setup.submit`: the form submission that creates the admin account.

## User Flow

1. Operator starts EmberDesk for the first time with `enableUserAccounts: true`.
2. Browser navigates to `http://localhost:8000/`.
3. Server detects zero users in storage (`needsSetup()` returns true).
4. Browser redirects to `/setup`.
5. Operator enters a handle, optional display name, and password.
6. Operator confirms the password.
7. Operator submits the form.
8. Server validates input, creates the admin user, establishes a session.
9. Browser redirects to `/` — operator is inside the workspace.

Legacy password setup path:

1. Server finds exactly one stored user and that user has no password.
2. Browser opens `/setup`.
3. `GET /api/users/setup-mode` returns `set-password`.
4. The setup page hides handle and display-name fields and asks only for password confirmation.
5. Operator submits a password.
6. Server stores the password hash for the existing user, establishes a session, and redirects the browser to `/`.

## Business Rules And Boundaries

- The setup page is shown only when `enableUserAccounts` is true and storage either has zero users or exactly one passwordless user.
- The handle is slugified: lowercase alphanumeric with hyphens, no leading/trailing hyphens.
- The password is required; passwordless accounts are not allowed through setup.
- The display name defaults to the handle if left empty.
- The created user is always `admin: true` and `enabled: true`.
- If setup is already complete, visiting `/setup` redirects to `/login`.
- The setup endpoint does not use rate limiting (it is a one-time operation).
- `initUserStorage()` does not create a default user when `enableUserAccounts` is true. Storage starts empty.
- Existing deployments with multiple users or password-protected users are unaffected: `needsSetup()` returns false.
- Existing deployments with one passwordless user must set a password before normal workspace access.

## ID Boundary Notes

This feature is separate from [Login Submit](feature.login_submit) because setup is a one-time initialization action, not a recurring authentication flow. Setup creates the first user; login authenticates existing users.

## Outcomes

- **Success**: the admin account is created, the operator is logged in, and the workspace loads.
- **Password set for existing user**: the existing single passwordless user receives a password, the operator is logged in, and the workspace loads.
- **Setup already complete**: the operator is redirected to `/login`.
- **Validation failure**: an error message appears on the setup card and the operator can retry.

## Code Binding Points

- `needsSetup()` in `src/user-storage.js` owns server-side setup gating.
- `GET /api/users/setup-mode` and `POST /api/users/setup` in `src/endpoints/users-public.js` own setup mode and submission behavior.
- `setupPageMiddleware()` in `src/users.js` owns `/setup` route selection, including the React feature flag and legacy fallback decision.
- `app/routes/setup.tsx` owns the React setup behavior for `/setup` when `features.react.pages.setup` is enabled.
- `createSetupController()` and `initSetupPage()` in `public/scripts/setup.js` own the legacy setup behavior, including the stable `/setup.html` fallback surface.
