---
id: feature.password_recovery
type: feature
name: Password Recovery
related: [page.login, feature.login_submit]
---

# Feature: Password Recovery

## ID 解释

`feature.password_recovery` represents the two-step password reset flow available from the login page. It covers switching from the login card to the recovery card, requesting a recovery code, and submitting the code with a new password. It does not cover the underlying code-generation or hashing mechanisms.

## Feature Purpose

This feature lets a user who has forgotten their password regain access to their account without contacting an administrator.

## Trigger Entry

- **Primary entry**: press "Forgot password?" on the login card.
- **Return entry**: press "Back to sign in" on the recovery card to return to the login form.

## Interaction IDs

- `feature.password_recovery`: the full recovery flow from start to finish.
- `feature.password_recovery.open`: switching from login card to recovery card.
- `feature.password_recovery.send_code`: submitting the handle to receive a recovery code.
- `feature.password_recovery.reset`: submitting the code and new password.
- `feature.password_recovery.cancel`: returning to the login card without completing recovery.

## User Flow

1. The user presses "Forgot password?" on the login card.
2. EmberDesk shows the recovery card and hides the login card.
3. The user enters their handle and presses "Send recovery code".
4. EmberDesk sends the code request to the server; the code is printed to the server console.
5. The recovery card expands to show the code and new-password fields.
6. The user enters the recovery code and a new password, then presses "Reset password".
7. On success, EmberDesk returns to the login card so the user can sign in with the new password.
8. On failure, the error is shown on the recovery card.

## Business Rules And Boundaries

- Recovery codes are single-use and expire after a short window.
- The recovery code is delivered via the server console, not via email or SMS.
- A rate limit applies to code requests, separate from the login rate limit.
- The recovery card does not reveal whether a handle exists; the server returns a generic error for unknown handles.
- After a successful reset, the user must log in again; the recovery flow does not auto-authenticate.

## ID Boundary Notes

This feature is separate from [Login Submit](feature.login_submit) because recovery is a distinct user goal with its own flow, rate limits, and error states.

## Outcomes

- **Success**: the password is reset and the user returns to the login card.
- **Failure**: an error message appears on the recovery card and the user can retry or cancel.
