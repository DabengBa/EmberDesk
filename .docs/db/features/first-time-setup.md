---
id: feature.first_time_setup
type: feature
name: First-Time Setup
related: [page.setup, page.login, feature.login_submit]
---

# Feature: First-Time Setup

## ID 解释

`feature.first_time_setup` represents the one-time admin account creation flow that runs on a fresh EmberDesk deployment. It covers the setup detection, the redirect to the setup page, the form submission, and the transition to the authenticated workspace. It does not cover subsequent logins, multi-user management, or password recovery.

## Feature Purpose

This feature ensures that every new deployment starts with a password-protected admin account, eliminating the security gap of passwordless auto-login.

## Trigger Entry

- **Automatic entry**: visiting any route when `enableUserAccounts` is true and no users exist in storage.
- **Direct entry**: navigating to `/setup` (redirects to `/login` if setup is already complete).

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

## Business Rules And Boundaries

- The setup page is shown only when `enableUserAccounts` is true and storage has zero users.
- The handle is slugified: lowercase alphanumeric with hyphens, no leading/trailing hyphens.
- The password is required; passwordless accounts are not allowed through setup.
- The display name defaults to the handle if left empty.
- The created user is always `admin: true` and `enabled: true`.
- If setup is already complete (users exist), visiting `/setup` redirects to `/login`.
- The setup endpoint does not use rate limiting (it is a one-time operation).
- `initUserStorage()` does not create a default user when `enableUserAccounts` is true. Storage starts empty.
- Existing deployments upgrading are unaffected: they already have users, so `needsSetup()` returns false.

## ID Boundary Notes

This feature is separate from [Login Submit](feature.login_submit) because setup is a one-time initialization action, not a recurring authentication flow. Setup creates the first user; login authenticates existing users.

## Outcomes

- **Success**: the admin account is created, the operator is logged in, and the workspace loads.
- **Setup already complete**: the operator is redirected to `/login`.
- **Validation failure**: an error message appears on the setup card and the operator can retry.
