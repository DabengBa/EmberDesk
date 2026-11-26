---
id: page.setup
type: page
name: 初始设置页
route: /setup
related: [feature.first_time_setup, page.login, page.chat_workspace]
---

# Page: 初始设置页

## ID 解释

`page.setup` represents the one-time setup surface shown when account protection is enabled but no password-protected administrator account exists yet. It covers both first-time administrator creation and adding a password to an existing passwordless account. It does not cover subsequent logins, multi-user registration, or password recovery.

## Page Purpose

This page exists so a new deployment operator must create a password-protected administrator account before accessing [Chat Workspace](page.chat_workspace). It prevents automatic entry through a passwordless account on first launch.

## Page-Level Semantic IDs

- `feature.first_time_setup`: the full setup flow from first-use detection through account creation.

## Included Features

!include feature.first_time_setup

## Page States And Constraints

- **First-time state**: the setup form asks for a handle, an optional display name, a password, and password confirmation.
- **Add-password state**: when an existing passwordless account must be upgraded, the form asks only for a new password and its confirmation. The title becomes "设置密码" and the action becomes "设置密码并登录".
- **Mode-loading state**: while the needed setup mode is being determined, the page shows a loading message instead of a guessed form.
- **Mode-error state**: if the setup mode cannot be determined, the page shows an alert with an explicit retry action; it never silently chooses first-time setup.
- **Loading state**: the submit button is disabled and shows "创建中..." while the request is in progress.
- **Error state**: a validation or setup error appears in the form's alert area. Validation marks and focuses the first invalid field and associates it with the alert; setup failures show the alert without marking or focusing a field.
- **Success state**: after the administrator account is created and signed in, the browser goes to [Chat Workspace](page.chat_workspace).
- **Already-complete state**: once setup is finished, opening the setup page takes the user to [Login](page.login). An already-open page also moves to [Login](page.login) as soon as completion is detected, and a late submit redirects there instead of showing an error.
- **Rate-limit state**: after too many setup attempts from one client in a short period, the form shows a generic error and stops accepting further attempts until the limit clears.

The page does not allow passwordless accounts. In first-time setup both handle and password are required; when adding a password to the existing account, only the password is new and the handle already belongs to that account.

The password must be at least eight characters, and confirmation must match. The form checks that fields are filled and matching; length is enforced as part of setup.

In first-time setup the handle is normalized for use as an account identifier: it is lowercased, diacritics are removed, and unsupported characters collapse into hyphens. A handle that becomes empty after normalization is rejected, as is a handle already in use.

## Navigation

- The setup page is the entry point when account protection is enabled and no administrator account exists, or when the only existing account has no password.
- Successful setup navigates to [Chat Workspace](page.chat_workspace).
- The setup page has no outgoing navigation links.

## Behavioral Notes

- The setup page is shown until the user store has a password-protected account. After setup is complete, `/setup` redirects to `/login`.
- The display name field is optional; if left empty, the handle is used as the display name.
- The created account is always an enabled administrator.
- Simultaneous setup attempts cannot create more than one administrator account.
