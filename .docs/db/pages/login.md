---
id: page.login
type: page
name: 登录页
route: /login
related: [feature.login_submit, feature.password_toggle, feature.password_recovery, feature.account_lockout, page.chat_workspace]
---

# Page: 登录页

## ID 解释

`page.login` represents the standalone login surface that appears before any authenticated workspace content. It covers the unified handle-and-password form, the password recovery card, and all lockout-related error display. It does not cover user registration, session management UI, or the main workspace shell.

## Page Purpose

This page exists so an unauthenticated user can identify themselves and reach [Chat Workspace](page.chat_workspace). It replaces the older dual-mode login (card-select and discreet login) with a single consistent form.

## Page Structure (UI Layout)

1. **Login card**: the primary form with handle input, password input with inline toggle, submit button, error block, and "Forgot password?" link.
2. **Recovery card**: a secondary form, hidden by default, with handle input, recovery code input, new-password input, and submit button.
3. **Header**: logo and page title shared by both cards.

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
