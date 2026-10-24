---
id: feature.login_submit
type: feature
name: Login Submit
related: [page.login, feature.account_lockout, feature.password_toggle, feature.password_recovery]
---

# Feature: Login Submit

## ID 解释

`feature.login_submit` represents the user-visible act of entering a handle and password on the login page and submitting the form to reach the authenticated workspace. It covers the form interaction, server response handling, and the transition from the login page to [Chat Workspace](page.chat_workspace). It does not cover password recovery, account lockout, or password visibility toggling.

## Purpose

Authenticate a registered user from the login card and move them into the main workspace only after explicit credential submission succeeds.

## User-Visible Contract

- The login form accepts a handle and password and submits only when the user presses Sign in or uses the form's keyboard submit behavior.
- Successful authentication navigates away from [Login](page.login) to [Chat Workspace](page.chat_workspace) without leaving the login card as the active page.
- Failed authentication keeps the user on the login card and shows an inline error there. A wrong handle and a wrong password both produce `账号或密码不正确`, but a disabled account returns a distinct `此账号已被禁用`.
- The user can correct the fields and retry from the same card after ordinary failure.
- Login submit is available only when account-based login is enabled. The login route does not check setup state; setup gating happens on `/`, which redirects to [Setup](page.setup).
- Submitting with an empty handle produces the client-side validation error `请输入用户名` and focuses the handle field instead of calling the server.

## Semantic Interaction IDs

- `feature.login_submit`: the full form-submission-and-authentication flow.
- `feature.login_submit.primary_entry`: submitting the form by button or Enter key.
- `feature.login_submit.error`: a failed authentication result shown on the login card.

## Acceptance Workflows

- As a registered user who wants to enter the workspace, from [Login](page.login) fill handle and password and submit with the button or Enter; EmberDesk must navigate to [Chat Workspace](page.chat_workspace), refresh or reopen must keep the authenticated workspace rather than returning to a stale login card, and failure is staying on the login card after valid credentials or navigating before valid credentials are accepted.
- As a registered user who mistypes credentials, from [Login](page.login) submit an invalid handle/password pair and then correct it; EmberDesk must keep the card visible with a generic inline error, allow retry from the same card after refresh or correction, and failure is field-specific disclosure, navigation to a separate error page, or a form state that cannot be corrected.
- As an unauthenticated user in a deployment that still needs setup, opening `/` must route the operator into the setup-required path described by [First-Time Setup](feature.first_time_setup). Reaching `/login` directly still renders the normal form; failure is passwordless access to [Chat Workspace](page.chat_workspace).

## Feature-Specific Evidence

- The primary evidence is visible navigation to workspace on success and inline login-card error on failure.
- Authentication status codes and session cookies are supporting evidence, not substitutes for visible page state.
- Keyboard submit evidence should show the same behavior as the Sign in button.

## Failure Signals

- The error message reveals that a handle exists and is enabled.
- The login page remains in history as the active surface after successful authentication.
- The form auto-submits without explicit user action.
- A failed submit leaves the user unable to edit and retry.

## Boundaries

- Repeated-failure lockout belongs to [Account Lockout](feature.account_lockout).
- Password visibility belongs to [Password Visibility Toggle](feature.password_toggle).
- Forgotten-password recovery belongs to [Password Recovery](feature.password_recovery).
- Authentication-page layout and configuration belong to [Login](page.login).
