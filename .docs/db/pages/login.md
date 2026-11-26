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

## Page-Level Semantic IDs

- `feature.login_submit`: submitting handle and password to authenticate.
- `feature.password_toggle`: the control that reveals or masks the password.
- `feature.password_recovery`: the forgot-password flow on the recovery card.
- `feature.account_lockout`: the lockout countdown and error state after repeated failed attempts.

## Included Features

!include feature.login_submit
!include feature.password_toggle
!include feature.password_recovery
!include feature.account_lockout

## Page States And Constraints

- **Default state**: the login form is visible and the recovery form is hidden. The page shows only a handle and password entry; there is no user list.
- **Automatic entry state**: when only one passwordless user exists, or an external identity provider identifies the visitor, the login form is skipped and the user arrives at [Chat Workspace](page.chat_workspace). `?noauto` keeps the form visible.
- **Recovery state**: the recovery form replaces the login form. A persistent hint states that recovery codes are printed to the server console and must be relayed by an administrator; focus moves to the first field on entry and back to the forgot-password link on cancel. In the second step the handle stays visible but cannot be changed, and the new-password field does not offer a visibility toggle.
- **Error state**: an error message appears on the active form without navigating away. Client-side validation marks and focuses the first invalid field and associates it with the error text; server-side failures show only the error text.
- **Lockout state**: after repeated failed sign-in attempts, the login button is disabled and a countdown is shown. The countdown runs from when the notice was received and is not resynchronized while the page stays open.
- **Loading state**: the submit button is disabled while a request is in flight.

The login page does not expose a user list. The user must know their handle to log in.

## Navigation

- The login page is the entry point when account protection is enabled and the visitor is not authenticated.
- Successful authentication navigates to [Chat Workspace](page.chat_workspace).
- The login page has no outgoing navigation links beyond the recovery flow.

## Password Recovery

Password recovery codes are printed to the server console log; there is no email or SMS delivery. An administrator must relay the code to the user out of band.
