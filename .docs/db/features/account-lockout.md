---
id: feature.account_lockout
type: feature
name: Account Lockout
related: [page.login, feature.login_submit]
---

# Feature: Account Lockout

## ID 解释

`feature.account_lockout` describes the temporary, visible lockout that appears after repeated failed login attempts. It covers the lockout message, the countdown shown on [Login](page.login), and the return to normal login availability when the lockout ends. It does not cover [Password Recovery](feature.password_recovery).

## Purpose

Protect an individual account from repeated failed login attempts by turning the login card into a temporary, visible lockout state after the threshold is reached.

## User-Visible Contract

- EmberDesk shows the same generic `账号已锁定` message regardless of the origin of the failed attempts, so the lockout does not disclose whether a handle exists.
- While lockout is active, the login card shows a countdown and disables normal submit so the user sees that retry is temporarily unavailable.
- When the lockout window expires, the countdown disappears and the login card becomes usable again without requiring a separate recovery route.
- A successful login before the threshold is reached clears the account failure state. Once the threshold is consumed no login can succeed, so this only applies to the pre-threshold case.
- Operators may configure the account threshold and duration or disable account lockout, but the user-facing behavior remains either a temporary countdown or normal login availability.

## Semantic Interaction IDs

- `feature.account_lockout`: the full lockout-and-unlock lifecycle.
- `feature.account_lockout.activate`: the transition from ordinary authentication failure to visible lockout.
- `feature.account_lockout.countdown`: the countdown state shown on the login card while retry is blocked.
- `feature.account_lockout.expire`: the visible return from lockout to normal login availability.

## Acceptance Workflows

- As a registered user who wants to regain access after mistyping credentials, from [Login](page.login) submit the same handle with incorrect passwords until the lockout threshold is reached; EmberDesk must show a generic lockout message, a countdown, and a disabled submit path, the countdown must survive refresh until the window expires, and failure is any disclosure that the handle exists or any accepted login submit while the countdown is active.
- As a registered user who remembers the correct password before lockout, from [Login](page.login) submit valid credentials after one or more earlier failures; EmberDesk must navigate to [Chat Workspace](page.chat_workspace), a refresh or reopen must keep the authenticated workspace rather than returning to a stale lockout, and failure is any residual countdown or generic lockout after successful authentication.
- As a locked-out user waiting for recovery, from the same login card wait until the countdown reaches zero or refresh near expiry, then submit valid credentials; EmberDesk must re-enable login on the card and allow normal authentication after the window ends, and failure is a countdown that sticks at zero, a disabled button after expiry, or a lockout message that never clears.

## Failure Signals

- The lockout message, countdown, or disabled submit state appears without repeated failed attempts.
- The countdown remains after its window has expired, or a login attempt is still refused after the countdown clears.
- A lockout response reveals whether the attempted handle exists.
- A successful login before lockout leaves a stale countdown or a lockout message on [Login](page.login) or after reopening [Chat Workspace](page.chat_workspace).

## Boundaries

- Covers only the visible lockout and return-to-login behavior on the authentication surface.
- Does not cover [Password Recovery](feature.password_recovery), credential validation in isolation, or login navigation that is not related to lockout; see [Login Submit](feature.login_submit).
