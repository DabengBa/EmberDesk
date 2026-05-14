---
id: feature.login_submit
type: feature
name: Login Submit
related: [page.login, feature.account_lockout, feature.password_toggle, feature.password_recovery]
---

# Feature: Login Submit

## ID 解释

`feature.login_submit` represents the user-visible act of entering a handle and password on the login page and submitting the form to reach the authenticated workspace. It covers the form interaction, server response handling, and the transition from the login page to [Chat Workspace](page.chat_workspace). It does not cover password recovery, account lockout, or password visibility toggling.

## Feature Purpose

This feature lets a registered user authenticate with their credentials and reach the main workspace.

## Trigger Entry

- **Primary entry**: press the "Sign in" button on the login form.
- **Keyboard entry**: press Enter while focused on the handle or password input.

## Interaction IDs

- `feature.login_submit`: the full form-submission-and-authentication flow.
- `feature.login_submit.primary_entry`: submitting the form via button or Enter key.
- `feature.login_submit.error`: an authentication failure shown on the login card.

## User Flow

1. The user enters their handle in the handle field.
2. The user enters their password in the password field.
3. The user submits the form.
4. EmberDesk sends the credentials to the server.
5. On success, EmberDesk redirects to [Chat Workspace](page.chat_workspace).
6. On failure, EmberDesk displays the error message on the login card without navigating away.

## Business Rules And Boundaries

- The form sends credentials only on explicit submit; there is no auto-submit or auto-login behavior.
- An authentication error must appear on the login card itself, not in a separate page or overlay.
- On successful login the user moves to the main workspace; the login page does not persist in browser history.
- The form must not expose which field (handle or password) was incorrect; the server returns a generic "Incorrect credentials" message.
- This feature covers the submit-and-authenticate contract only. Lockout behavior after repeated failures belongs to [Account Lockout](feature.account_lockout).

## ID Boundary Notes

This feature exists separately from password recovery because entering known credentials and recovering a forgotten password are distinct user goals with different flows and risk profiles.

## Outcomes

- **Success**: the user reaches the authenticated workspace.
- **Failure**: an error message appears on the login card and the user can retry.
