---
id: feature.account_lockout
type: feature
name: Account Lockout
related: [page.login, feature.login_submit]
---

# Feature: Account Lockout

## ID 解释

`feature.account_lockout` represents the per-account rate limiting and temporary lockout that activates after repeated failed login attempts for the same handle. It covers the lockout countdown displayed on the login page, the error message, and the automatic unlock after the lockout window expires. It does not cover the separate per-IP rate limit or password recovery.

## Feature Purpose

This feature protects individual accounts from brute-force login attempts by temporarily blocking further attempts after too many failures.

## Trigger Entry

- **Passive entry**: any failed login attempt contributes to the account's failure counter.
- **Visible entry**: the lockout state becomes visible when the failure counter exceeds the configured threshold (default: 5 attempts).

## Interaction IDs

- `feature.account_lockout`: the full lockout-and-unlock lifecycle.
- `feature.account_lockout.activate`: the moment the lockout triggers and the countdown appears.
- `feature.account_lockout.countdown`: the visible countdown timer shown on the login card.
- `feature.account_lockout.expire`: the lockout window ending and normal login resuming.

## User Flow

1. The user submits incorrect credentials multiple times for the same handle.
2. After the configured number of failures, the server responds with a 429 status and a `Retry-After` header.
3. EmberDesk displays a lockout error message with a countdown timer on the login card.
4. The login button is disabled for the duration of the lockout.
5. When the countdown reaches zero, the error message disappears and the user can attempt login again.
6. A successful login clears the failure counter for that account.

## Business Rules And Boundaries

- The lockout is per-account (keyed by handle), independent of the per-IP rate limit.
- The default lockout window is 300 seconds (5 minutes), configurable via `rateLimiting.accountsLoginLockoutDuration`.
- The default threshold is 5 failed attempts, configurable via `rateLimiting.accountsLoginMaxAttempts`.
- A successful login clears both the per-account and per-IP failure counters.
- The lockout message does not confirm whether the handle exists; the same error is returned for unknown handles.
- The countdown is driven by the `Retry-After` header from the server, not by a client-side timer estimate.

## ID Boundary Notes

This feature is separate from [Login Submit](feature.login_submit) because lockout is a security-rate-limiting behavior with its own visible state and user experience, not part of the normal authentication flow.

## Outcomes

- **Lockout active**: the countdown is visible and the login button is disabled.
- **Lockout expired**: the countdown disappears and login is available again.
- **Successful login before lockout**: the failure counter is cleared and no lockout occurs.
