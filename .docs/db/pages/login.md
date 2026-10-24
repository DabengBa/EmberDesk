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

This page exists so an unauthenticated user can identify themselves and reach [Chat Workspace](page.chat_workspace) through a single consistent handle-and-password form.

## Runtime Owner

- `/login` is served only by the shared React auth app.
- `/login.html` redirects to `/login` and preserves the query string; it is not a legacy runtime fallback.
- Missing React build returns a clear server error instead of `public/login.html`.
- Rollback is a previous application version deploy, not an in-process jQuery controller.
- Before serving the login app, `createLoginPageMiddleware()` runs `tryAutoLogin()`. When exactly one passwordless user exists, or when Authelia/Authentik/per-user Basic Auth identifies the visitor, the request redirects to `/` without rendering the login form. `?noauto` suppresses this so the form always renders.
- `/login` does not check setup state. A deployment that still requires setup serves the login form normally; only `/` redirects to `/setup`.

## Page Structure (UI Layout)

1. **Header row**: logo and page title shared by both cards, visually separated from the form controls so the page reads as a focused entry surface rather than a generic form.
2. **Credential field stack**: handle input and password input with inline toggle, kept as the only default decision path.
3. **Action region**: submit button, error block, and "Forgot password?" link with consistent spacing and focus treatment.
4. **Recovery card**: a secondary form, hidden by default, with the same header, field stack, recovery code input, new-password input, and action region. The handle input is disabled once step 2 is reached, and the new-password input has no visibility toggle (unlike the login and setup password fields).

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
- **Recovery state**: the recovery card is visible, the login card is hidden. A persistent hint above the step-1 action states that recovery codes are printed to the server console and must be relayed by an admin; focus moves to the card's first field on entry and back to the forgot-password link on cancel. In step 2 the handle input stays visible but disabled.
- **Error state**: an error message appears on the active card without navigating away. For client-side validation failures the first invalid field is marked `aria-invalid`, linked to the error block via `aria-describedby`, and receives focus; server-side failures set only the error text and never mark or focus a field.
- **Lockout state**: any HTTP 429 from `/api/users/login` disables the login button and shows a countdown derived from the `Retry-After` header. The copy always reads as an account lockout even when the trigger was the per-IP limiter rather than the per-account lockout. The countdown ticks client-side from receipt time and is never re-synced with the server.
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
| `sessionTimeout` | `-1` | Session lifetime in seconds. `-1` = never expires, `0` = expires on browser close. |
| `rateLimiting.accountsLoginMaxAttempts` | `5` | Drives two limiters: a per-IP limiter with a fixed 60-second window, and a per-account limiter whose window is `accountsLoginLockoutDuration`. `0` lifts both to effectively unlimited instead of disabling the code path. |
| `rateLimiting.accountsLoginLockoutDuration` | `300` | Lockout window in seconds (5 minutes). |
| `rateLimiting.accountsSetupMaxAttempts` | `5` | First-time setup attempts before IP rate limiting. `0` disables. |
| `rateLimiting.accountsRecoverMaxAttempts` | `5` | Recovery requests per IP within a 300-second window. `recover-step1` consumes on every request, not only on failure; `recover-step2` consumes only on a wrong code. `0` disables. |
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
