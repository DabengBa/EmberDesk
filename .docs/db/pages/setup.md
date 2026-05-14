---
id: page.setup
type: page
name: 初始设置页
route: /setup
related: [feature.first_time_setup, page.login, page.chat_workspace]
---

# Page: 初始设置页

## ID 解释

`page.setup` represents the one-time setup surface that appears on a fresh EmberDesk deployment when `enableUserAccounts` is true and no users exist in storage. It covers the admin account creation form and the redirect logic that gates access to the workspace. It does not cover subsequent logins, multi-user registration, or password recovery.

## Page Purpose

This page exists so a new deployment operator must create a password-protected admin account before accessing [Chat Workspace](page.chat_workspace). It prevents the security gap of passwordless auto-login on first launch.

## Page Structure (UI Layout)

1. **Setup card**: a single form with handle input, display name input (optional), password input with inline toggle, confirm password input with inline toggle, submit button, and error block.
2. **Header**: logo and page title "初始设置".

The page has no alternative cards or navigation links.

## Page-Level Semantic IDs

- `feature.first_time_setup`: the full setup flow from detection through account creation.

## Included Features

!include feature.first_time_setup

## Page States And Constraints

- **Default state**: the setup form is visible and enabled.
- **Loading state**: the submit button is disabled and shows "创建中..." while the request is in flight.
- **Error state**: a validation or server error appears on the card with a shake animation.
- **Success state**: the browser redirects to `/` after the admin account is created and session established.
- **Bypass state**: if `needsSetup()` returns false (users already exist), visiting `/setup` redirects to `/login`.

The page does not allow passwordless accounts. Both handle and password are required.

## Navigation

- The setup page is the entry point when `enableUserAccounts` is true and no users exist in storage.
- Successful setup navigates to [Chat Workspace](page.chat_workspace).
- The setup page has no outgoing navigation links.

## Configuration (config.yaml)

### Required

| Key | Default | Effect |
|---|---|---|
| `enableUserAccounts` | `true` | Activates the setup page. Without this, EmberDesk skips authentication and the setup page is never shown. |

## Behavioral Notes

- The setup page is shown exactly once per deployment. After the first admin account is created, `/setup` redirects to `/login`.
- The display name field is optional; if left empty, the handle is used as the display name.
- The created account is always admin and enabled.
