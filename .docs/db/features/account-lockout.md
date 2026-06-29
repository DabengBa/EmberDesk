---
id: feature.account_lockout
type: feature
name: Account Lockout
related: [page.login, feature.login_submit]
---

# Feature: Account Lockout

## ID 解释

`feature.account_lockout` represents the per-account rate limiting and temporary lockout that activates after repeated failed login attempts for the same handle. It covers the lockout countdown displayed on the login page, the error message, and the automatic unlock after the lockout window expires. It does not cover the separate per-IP rate limit or password recovery.

## Purpose

Protect an individual account from repeated failed login attempts by turning the login card into a temporary, visible lockout state after the configured threshold is reached.

## User-Visible Contract

- EmberDesk counts failed sign-in attempts per handle and shows a lockout only after the account threshold is exceeded; the message must not confirm whether the handle is real.
- While lockout is active, the login card shows a countdown and disables normal submit so the user sees that retry is temporarily unavailable.
- When the lockout window expires, the countdown disappears and the same login card becomes usable again without requiring a separate recovery route.
- A successful login before lockout clears the account failure state, so the user does not carry stale lockout risk into the authenticated workspace.
- Operators may configure the account threshold, duration, or disable account lockout, but the user-facing behavior remains either a temporary countdown or normal login availability.

## Semantic Interaction IDs

- `feature.account_lockout`: the full lockout-and-unlock lifecycle.
- `feature.account_lockout.activate`: the transition from ordinary authentication failure to visible lockout.
- `feature.account_lockout.countdown`: the countdown state shown on the login card while retry is blocked.
- `feature.account_lockout.expire`: the visible return from lockout to normal login availability.

## Acceptance Workflows

- As a registered user who wants to regain access after mistyping credentials, from [Login](page.login) submit the same handle with incorrect passwords until the lockout threshold is reached; EmberDesk must show a generic lockout message, a countdown, and a disabled submit path, the countdown must survive refresh until the window expires, and failure is any disclosure that the handle exists or any accepted login submit while the countdown is active.
- As a registered user who remembers the correct password before lockout, from [Login](page.login) submit valid credentials after one or more earlier failures; EmberDesk must navigate to [Chat Workspace](page.chat_workspace), a refresh or reopen must keep the authenticated workspace rather than returning to a stale lockout, and failure is any residual countdown or generic lockout after successful authentication.
- As a locked-out user waiting for recovery, from the same login card wait until the countdown reaches zero or refresh near expiry, then submit valid credentials; EmberDesk must re-enable login on the card and allow normal authentication after the window ends, and failure is a countdown that sticks at zero, a disabled button after expiry, or a lockout message that never clears.

## Feature-Specific Evidence

- The visible countdown is derived from the server-provided retry window; DOM timers are supporting evidence, not the contract.
- Account lockout is distinct from per-IP rate limiting and should be proven through the login card state rather than raw status codes alone.
- Config evidence may include `rateLimiting.accountsLoginMaxAttempts` and `rateLimiting.accountsLoginLockoutDuration`, but the user-visible proof is the countdown, disabled submit state, expiry, and successful post-expiry login.

## Failure Signals

- The lockout copy reveals whether the submitted handle exists.
- The login button remains enabled while the card says the account is locked.
- The countdown expires but the user cannot retry without a page restart.
- A successful login leaves stale lockout state visible on a later login page visit.

## Boundaries

- Normal credential submission belongs to [Login Submit](feature.login_submit).
- Password reset belongs to [Password Recovery](feature.password_recovery).
- The login page layout, config table, and authentication-page composition belong to [Login](page.login).
