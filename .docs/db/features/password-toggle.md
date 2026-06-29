---
id: feature.password_toggle
type: feature
name: Password Visibility Toggle
related: [page.login, page.setup, feature.login_submit, feature.first_time_setup]
---

# Feature: Password Visibility Toggle

## ID 解释

`feature.password_toggle` represents the small inline control on authentication pages that lets a user temporarily reveal or hide password text while typing. It covers the toggle button, the icon change, and the input type switch on login and setup surfaces. It does not affect password storage, authentication, setup submission, or recovery.

## Purpose

Let users briefly reveal or re-mask password text on authentication surfaces so they can check what they typed without changing the submitted value.

## User-Visible Contract

- Each password field starts masked on page load.
- Pressing the inline eye control reveals only the associated password field, updates the icon state, and exposes pressed state to assistive technology.
- Pressing the same control again re-masks the same field and returns the icon to the hidden state.
- The toggle changes presentation only; it must not modify, submit, store, clear, or validate the password value.
- The reveal state is temporary and does not persist across refreshes or reopened authentication pages.

## Semantic Interaction IDs

- `feature.password_toggle`: the full reveal-and-hide cycle.
- `feature.password_toggle.reveal`: switching a password field from masked to readable text.
- `feature.password_toggle.hide`: switching that field back to masked text.

## Acceptance Workflows

- As a login user who wants to check a typed password, from [Login](page.login) type a password and press the inline eye button twice; EmberDesk must reveal and then re-mask the same text with matching icon and pressed state, a refresh must return the field to masked presentation, and failure is changed password value, persisted reveal state, or a toggle that affects a different field.
- As an operator setting up an account, from [Setup](page.setup) use the password and confirm-password reveal controls independently and refresh before submit; EmberDesk must reveal only the targeted field while preserving the other field state, return both fields to masked presentation after refresh, and leave validation/submission unchanged, with failure signaled by cross-field reveal, cleared input, or authentication/setup side effects from the visual toggle.

## Feature-Specific Evidence

- The visible input masking, icon change, and assistive pressed state are primary evidence.
- `getPasswordVisibilityState()` in `public/scripts/login.js` and `getSetupPasswordVisibilityState()` in `public/scripts/setup.js` are helper evidence for expected state calculation.
- DOM `input.type` changes are supporting evidence only when the user-visible text and icon state match.

## Failure Signals

- Revealing a password changes its submitted value.
- A refresh reopens the page with password text still visible.
- The toggle lacks an exposed state for assistive technology.
- A setup-page toggle reveals or hides both password fields at once.

## Boundaries

- Submitting credentials belongs to [Login Submit](feature.login_submit).
- Creating the first password-protected account belongs to [First-Time Setup](feature.first_time_setup).
- Password reset belongs to [Password Recovery](feature.password_recovery).
