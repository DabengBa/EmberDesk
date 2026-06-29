---
id: feature.first_time_setup
type: feature
name: First-Time Setup
related: [page.setup, page.login, feature.login_submit]
---

# Feature: First-Time Setup

## ID 解释

`feature.first_time_setup` represents the one-time account hardening flow that runs before EmberDesk allows normal workspace access. It covers setup detection, the redirect to the setup page, fresh admin account creation, the legacy single passwordless-user password setup path, and the transition to the authenticated workspace. It does not cover subsequent logins, multi-user management, or password recovery.

## Purpose

Force a new or legacy passwordless deployment through a visible account-hardening flow before normal workspace access is allowed.

## User-Visible Contract

- When account login is enabled and setup is still required, visiting the workspace routes the operator to [Setup](page.setup) instead of exposing the workspace.
- Fresh setup lets the operator create the first password-protected admin account with handle, optional display name, password, and confirmation.
- The legacy single-passwordless-user path asks only for a new password and confirmation for the existing user; it must not create a duplicate account.
- Passwordless setup completion is not allowed: validation errors appear on the setup card and the operator can correct input there.
- After setup succeeds, the operator is authenticated and reaches [Chat Workspace](page.chat_workspace); once setup is complete, `/setup` no longer opens the setup form and redirects to login.
- `/setup.html` remains a legacy rollback surface for operator fallback, but it must preserve the same setup semantics.

## Semantic Interaction IDs

- `feature.first_time_setup`: the full setup lifecycle.
- `feature.first_time_setup.detect`: the visible setup-required routing state before normal workspace access.
- `feature.first_time_setup.submit`: submitting setup details to create or harden the admin account.

## Acceptance Workflows

- As a first-time operator who wants to secure a new deployment, from the root workspace URL with account login enabled and no users, follow the redirect to [Setup](page.setup), enter handle, optional display name, password, and matching confirmation, then submit; EmberDesk must create the admin session and open [Chat Workspace](page.chat_workspace), refresh or reopen must not expose passwordless access, and failure is reaching the workspace before setup or returning to setup after success.
- As an operator upgrading a deployment with exactly one passwordless user, from `/setup` enter and confirm a password in the reduced setup form; EmberDesk must authenticate the existing user and open the workspace without asking for handle/display name, later login must require that password, and failure is creating a second user, showing fresh-account fields, or allowing workspace access without setting a password.
- As an operator whose setup input is invalid, from [Setup](page.setup) submit missing or mismatched password fields; EmberDesk must keep the setup card visible with an error and allow correction, a refresh must still show setup-required state until valid completion, and failure is silent navigation, partial account creation, or lost recovery path.
- As an operator after setup is complete, from `/setup` open the setup route again; EmberDesk must redirect to [Login](page.login), the legacy `/setup.html` fallback must remain available only as a rollback surface with matching setup semantics, and failure is reopening the normal setup form for an already secured deployment.

## Feature-Specific Evidence

- Visible redirect behavior, setup mode, form fields, inline errors, and final workspace navigation are primary evidence.
- `needsSetup()` in `src/user-storage.js`, setup public endpoints, setup middleware, React `/setup`, and legacy `public/scripts/setup.js` are implementation evidence for the same user-facing contract.
- Storage state and password hashes are supporting evidence, not substitutes for proving the operator cannot access the workspace before setup.

## Failure Signals

- A passwordless account reaches the workspace while setup is still required.
- Fresh setup accepts an empty password or mismatched confirmation.
- The legacy passwordless-user path creates a new account instead of hardening the existing user.
- `/setup` remains open after setup has already completed.

## Boundaries

- Recurring authentication belongs to [Login Submit](feature.login_submit).
- Login-page composition belongs to [Login](page.login).
- Setup page layout and routing details belong to [Setup](page.setup).
- Password visibility on setup fields belongs to [Password Visibility Toggle](feature.password_toggle).
