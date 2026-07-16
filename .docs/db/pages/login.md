---
id: page.login
type: page
name: 登录页
route: /login
related: [feature.login_submit, feature.password_toggle, feature.password_recovery, feature.account_lockout, page.chat_workspace, page.setup]
---

# Page: 登录页

## ID 解释

`page.login` represents the standalone login surface that appears before any authenticated workspace content. It covers the unified handle-and-password form, the password recovery card, and all lockout-related error display. It does not cover user registration, session management UI, or the main workspace shell.

## Page Purpose

This page exists so an unauthenticated user can identify themselves and reach [Chat Workspace](page.chat_workspace). It replaces the older dual-mode login (card-select and discreet login) with a single consistent form.

## Runtime Owner

- `/login` is served only by the shared React auth app.
- `/login.html` redirects to `/login` and preserves the query string; it is not a legacy runtime fallback.
- Missing React build returns a clear server error instead of `public/login.html`.
- Rollback is a previous application version deploy, not an in-process jQuery controller.

## Page Structure (UI Layout)

1. **Header row**: logo and page title shared by both cards, visually separated from the form controls so the page reads as a focused entry surface rather than a generic form.
2. **Credential field stack**: handle input and password input with inline toggle, kept as the only default decision path.
3. **Action region**: submit button, error block, and "Forgot password?" link with consistent spacing and focus treatment.
4. **Recovery card**: a secondary form, hidden by default, with the same header, field stack, recovery code input, new-password input, and action region.

The two cards are mutually exclusive; only one is visible at a time.

## Page-Level Semantic IDs

- `feature.login_submit`: submitting handle and password to authenticate.
- `feature.password_toggle`: the inline eye-icon control that reveals or masks the password.
- `feature.password_recovery`: the forgot-password flow on the recovery card.
- `feature.account_lockout`: the lockout countdown and error state after repeated failed attempts.

## Included Features

!include feature.login_submit
!include feature.password_toggle
!include feature.password_recovery
!include feature.account_lockout

## Page States And Constraints

- **Default state**: the login card is visible, the recovery card is hidden.
- **Recovery state**: the recovery card is visible, the login card is hidden.
- **Error state**: an error message appears on the active card without navigating away.
- **Lockout state**: the login button is disabled and a countdown timer is displayed after too many failed attempts.
- **Loading state**: the submit button is disabled while a request is in flight.

The login page does not expose a user list. The user must know their handle to log in.

## Navigation

- The login page is the entry point when `enableUserAccounts` is true and the visitor is not authenticated.
- Successful authentication navigates to [Chat Workspace](page.chat_workspace).
- The login page has no outgoing navigation links beyond the recovery flow.

## Configuration (config.yaml)

### Required

| Key | Default | Effect |
|---|---|---|
| `enableUserAccounts` | `true` in the default config; omitted keys fall back to `false` for legacy deployments | Activates the login page. Without this, EmberDesk skips authentication entirely. |

### Optional

| Key | Default | Effect |
|---|---|---|
| `enableDiscreetLogin` | `false` | `true` hides the user list; the user must type their handle manually. |
| `features.react.pages.login` | `true` | Current migration flag. The approved retirement direction removes this switch and the `/login.html` fallback after full route parity proof. |
| `sessionTimeout` | `-1` | Session lifetime in seconds. `-1` = never expires, `0` = expires on browser close. |
| `rateLimiting.accountsLoginMaxAttempts` | `5` | Failed login attempts before per-account lockout. `0` disables. |
| `rateLimiting.accountsLoginLockoutDuration` | `300` | Lockout window in seconds (5 minutes). |
| `rateLimiting.accountsSetupMaxAttempts` | `5` | First-time setup attempts before IP rate limiting. `0` disables. |
| `rateLimiting.accountsRecoverMaxAttempts` | `5` | Failed recovery attempts before rate limiting. `0` disables. |
| `rateLimiting.preferRealIpHeader` | `false` | Use forwarded IP headers for rate-limit tracking behind a reverse proxy. |
| `disableCsrfProtection` | `false` | Disables CSRF token enforcement on login API. Not recommended. |

### Legacy: Basic Auth (deprecated)

> `basicAuthMode` is a legacy feature retained for backward compatibility. New deployments should use `enableUserAccounts` exclusively.

| Key | Default | Effect |
|---|---|---|
| `basicAuthMode` | `false` | Enables HTTP Basic Auth (browser native prompt, no login page UI). Only active when `listen: true`. |
| `basicAuthUser.username` / `.password` | `"user"` / `"password"` | Global Basic Auth credentials. |
| `perUserBasicAuth` | `false` | When `true` with `basicAuthMode`, uses per-account credentials instead of the global pair. |

When both `basicAuthMode` and `enableUserAccounts` are active, the user must pass Basic Auth first, then log in via the login page.

### Password Recovery

Password recovery codes are **printed to the server console log** — there is no email or SMS delivery. The server operator must relay the code to the user out-of-band.

## Approved Retirement Direction

The React login route is a first-wave legacy-retirement candidate. Before removal, it must preserve login, lockout, password visibility, recovery, authentication redirects, and accessibility behavior; after removal, `/login.html` and the legacy runtime path are not offered as a same-version fallback.
