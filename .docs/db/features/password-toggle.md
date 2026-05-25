---
id: feature.password_toggle
type: feature
name: Password Visibility Toggle
related: [page.login, page.setup, feature.login_submit, feature.first_time_setup]
---

# Feature: Password Visibility Toggle

## ID 解释

`feature.password_toggle` represents the small inline control on authentication pages that lets a user temporarily reveal or hide password text while typing. It covers the toggle button, the icon change, and the input type switch on login and setup surfaces. It does not affect password storage, authentication, setup submission, or recovery.

## Feature Purpose

This feature helps a user verify what they typed before submitting, reducing failed login or setup attempts caused by typos.

## Trigger Entry

- **Primary entry**: press the eye icon button inside a password field.

## Interaction IDs

- `feature.password_toggle`: the full reveal-and-hide cycle.
- `feature.password_toggle.reveal`: switching the input from masked to plain text.
- `feature.password_toggle.hide`: switching the input back to masked.

## User Flow

1. The user starts typing a password (text is masked).
2. The user presses the toggle button.
3. The password text becomes visible and the icon switches to the "eye-slash" state.
4. The user presses the toggle button again.
5. The password text is masked again and the icon returns to the "eye" state.

## Business Rules And Boundaries

- The toggle only changes the visual presentation (`input.type`); it does not affect the underlying value.
- The toggle does not persist across page loads; the password field always starts masked.
- The button uses `aria-pressed` to communicate its state to assistive technology.

## ID Boundary Notes

This feature is narrow enough to stand alone because the toggle interaction is self-contained and has no side effects on authentication, setup, or recovery behaviors.

## Outcomes

- **Reveal**: the user can read their password text and the icon reflects the revealed state.
- **Hide**: the password text is masked again and the icon reflects the hidden state.

## Code Binding Points

- `getPasswordVisibilityState()` in `public/scripts/login.js` owns the login password toggle state calculation.
- `getSetupPasswordVisibilityState()` in `public/scripts/setup.js` owns setup password toggle state calculation for password and confirm-password fields.
