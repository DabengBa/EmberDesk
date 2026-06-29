---
id: feature.password_recovery
type: feature
name: Password Recovery
related: [page.login, feature.login_submit]
---

# Feature: Password Recovery

## ID 解释

`feature.password_recovery` represents the two-step password reset flow available from the login page. It covers switching from the login card to the recovery card, requesting a recovery code, and submitting the code with a new password. It does not cover the underlying code-generation or hashing mechanisms.

## Purpose

Let a user reset a forgotten password from the login surface through a recovery-card flow that returns them to normal sign-in after reset.

## User-Visible Contract

- The Forgot password entry switches the login card to the recovery card without leaving [Login](page.login).
- The recovery flow has two visible phases: request a recovery code for a handle, then submit the code with a new password.
- Recovery errors appear on the recovery card and do not reveal whether the handle exists.
- Recovery codes are single-use and short-lived; EmberDesk does not promise email, SMS, or in-app code delivery, so the user must obtain the code out of band from the server operator.
- A successful reset returns the user to the login card; it does not automatically authenticate them.
- The Back to sign in action cancels recovery and restores the normal login card without changing the password.

## Semantic Interaction IDs

- `feature.password_recovery`: the full recovery flow from start to finish.
- `feature.password_recovery.open`: switching from login card to recovery card.
- `feature.password_recovery.send_code`: requesting a recovery code for a handle.
- `feature.password_recovery.reset`: submitting the code and new password.
- `feature.password_recovery.cancel`: returning to the login card without completing recovery.

## Acceptance Workflows

- As a user who forgot their password, from [Login](page.login) open Forgot password, request a code for the handle, obtain the code out of band, enter the code and a new password, then reset; EmberDesk must return to the login card and require a normal sign-in with the new password, refresh or reopen must not auto-authenticate the user, and failure is automatic login, missing success transition, or a reset that cannot be followed by sign-in.
- As a user who entered invalid recovery details, from the recovery card submit an unknown handle, expired code, wrong code, or invalid new password and then retry or cancel; EmberDesk must keep the recovery card visible with a generic recoverable error across that correction path, and failure is handle-existence disclosure, navigation to a separate error page, or a dead-end card.
- As a user who changes their mind, from the recovery card choose Back to sign in before reset completes; EmberDesk must restore the login card with no password change, a refresh must show the normal login state rather than a half-completed reset, and failure is a forced password reset or recovery state that cannot be exited.

## Feature-Specific Evidence

- Card switching, recovery-phase fields, generic errors, cancel behavior, and return to login are primary evidence.
- Server console delivery of the code is operational evidence; it does not make code delivery an in-app user-visible promise.
- Rate-limit responses support recovery proof only when the card shows recoverable feedback without account disclosure.

## Failure Signals

- Recovery UI reveals whether the submitted handle exists.
- Reset success authenticates the user automatically instead of returning to login.
- The user cannot cancel back to the login card.
- The recovery request implies email or SMS delivery that the product does not provide.

## Boundaries

- Normal sign-in after reset belongs to [Login Submit](feature.login_submit).
- Login page layout belongs to [Login](page.login).
- Password masking and reveal controls belong to [Password Visibility Toggle](feature.password_toggle).
