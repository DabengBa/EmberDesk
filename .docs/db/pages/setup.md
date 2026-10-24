---
id: page.setup
type: page
name: 初始设置页
route: /setup
related: [feature.first_time_setup, page.login, page.chat_workspace]
---

# Page: 初始设置页

## ID 解释

`page.setup` represents the one-time setup surface that appears when `enableUserAccounts` is true and the user store still needs a password-protected account. It covers both fresh admin account creation and the legacy single passwordless-user upgrade path. It does not cover subsequent logins, multi-user registration, or password recovery.

## Page Purpose

This page exists so a new deployment operator must create a password-protected admin account before accessing [Chat Workspace](page.chat_workspace). It prevents the security gap of passwordless auto-login on first launch.

## Runtime Owner

- `/setup` is served only by the shared React auth app.
- `/setup.html` redirects to `/setup` and preserves the query string; it is not a legacy runtime fallback.
- Missing React build returns a clear server error instead of `public/setup.html`.
- Rollback is a previous application version deploy, not an in-process jQuery controller.

## Page Structure (UI Layout)

1. **Header row**: logo and page title "初始设置", visually separated from the setup controls.
2. **Identity field group**: handle input and optional display-name input.
3. **Security field group**: password input with inline toggle and confirm-password input with inline toggle.
4. **Action region**: submit button and error block with consistent spacing and focus treatment.

In `set-password` mode, the same card hides the handle and display-name fields, changes the title to "设置密码", and uses "设置密码并登录" as the submit CTA.

The page has no alternative cards or navigation links.

## Page-Level Semantic IDs

- `feature.first_time_setup`: the full setup flow from detection through account creation.

## Included Features

!include feature.first_time_setup

## Page States And Constraints

- **Default state**: the setup form is visible and enabled in `fresh` mode.
- **Set-password state**: when `GET /api/users/setup-mode` reports `set-password`, only the password and confirm-password fields remain visible.
- **Mode-loading state**: while the setup-mode request is in flight the card shows a loading message instead of a guessed form.
- **Mode-error state**: a failed setup-mode request shows an alert with an explicit retry action; the page never falls back to `fresh` silently.
- **Loading state**: the submit button is disabled and shows "创建中..." while the request is in flight.
- **Error state**: a validation or server error appears in the card's alert block. Client-side validation marks the first invalid field with `aria-invalid`, links it to the error block via `aria-describedby`, and focuses it; server-side failures set the alert without marking or focusing a field.
- **Success state**: the browser redirects to `/` after the admin account is created and session established.
- **Bypass state**: `GET /setup` redirects to `/login` server-side when `needsSetup()` returns false. If the page is already open, the client also redirects to `/login` as soon as `GET /api/users/setup-mode` reports `mode: 'complete'`, and a submit against an already-completed deployment (HTTP 403 `Setup already completed`) redirects to `/login` instead of showing an error.
- **Rate-limit state**: the setup endpoint consumes `rateLimiting.accountsSetupMaxAttempts` per client IP; exhaustion returns HTTP 429 and the card shows the generic error.

The page does not allow passwordless accounts. In `fresh` mode, both handle and password are required. In `set-password` mode, password is required and the handle belongs to the existing single passwordless user.

Password strength is validated server-side only: the password must be at least 8 characters (`Password must be at least 8 characters long`). The form itself only enforces non-empty and matching confirmation.

In `fresh` mode the submitted handle is slugified server-side (lowercased, diacritics removed, non-alphanumerics collapsed to `-`); an empty result returns `Invalid handle`, and a collision with an existing handle returns HTTP 409 `User already exists`.

## Navigation

- The setup page is the entry point when `enableUserAccounts` is true and no users exist in storage, or when the only stored user has no password.
- Successful setup navigates to [Chat Workspace](page.chat_workspace).
- The setup page has no outgoing navigation links.

## Configuration (config.yaml)

### Required

| Key | Default | Effect |
|---|---|---|
| `enableUserAccounts` | `true` in the default config; omitted keys fall back to `false` for legacy deployments | Activates the setup page. Without this, EmberDesk skips authentication and the setup page is never shown. |

### Optional

| Key | Default | Effect |
|---|---|---|
| `rateLimiting.accountsSetupMaxAttempts` | `5` | Setup attempts per client IP within a 300-second window before HTTP 429. `0` disables the limit. |
| `rateLimiting.preferRealIpHeader` | `false` | Use forwarded IP headers for rate-limit tracking behind a reverse proxy. |

## Behavioral Notes

- The setup page is shown until the user store has a password-protected account. After setup is complete, `/setup` redirects to `/login`.
- The display name field is optional; if left empty, the handle is used as the display name.
- The created account is always admin and enabled.
- `app/routes/setup.tsx` owns the setup page. `/setup.html` is served by `createLegacySetupHtmlRedirectMiddleware()` and only redirects to `/setup`.
- Setup completion is serialized by a server-side lock, so concurrent submits cannot create multiple admins.
