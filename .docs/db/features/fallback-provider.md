---
id: feature.fallback_provider
type: feature
name: Fallback Provider
related: [page.api_configuration, feature.connection_profile]
---

# Feature: Fallback Provider

## ID 解释

`feature.fallback_provider` represents the optional OpenAI-compatible fallback connection that lives inside the API configuration drawer. It covers the fallback enabled toggle, base URL, model, secret-backed API key controls, and the visible cost warning. It does not cover general connection profiles, provider routing, or non-OpenAI-compatible protocols.

## Purpose

Let a user configure an optional second OpenAI-compatible endpoint that eligible visible-chat recovery may use after the primary provider retry is exhausted.

## User-Visible Contract

- The fallback section lives inside [API Configuration](page.api_configuration) and remains separate from the main provider credentials.
- Fallback use is disabled until the user enables it and supplies the required base URL, model, and dedicated API key.
- The section shows enough readiness state and warning copy for the user to understand that fallback can create extra API requests and cost.
- The fallback API key is handled as a dedicated secret; after save, the UI must not expose the raw secret as plain settings text.
- If saving the fallback key fails, the typed value remains available in the input so the user can retry or copy it instead of losing the secret.
- Quiet and background helpers do not consume this fallback: they return text without a visible assistant row or automatic recovery.

## Semantic Interaction IDs

- `feature.fallback_provider.enabled`: enabling or disabling fallback use.
- `feature.fallback_provider.base_url`: entering the fallback endpoint.
- `feature.fallback_provider.model`: entering the fallback model name.
- `feature.fallback_provider.api_key`: saving or clearing the dedicated fallback secret.
- `feature.fallback_provider.status`: reading the current readiness state.

## Acceptance Workflows

- As an API-configuration user who wants a recovery endpoint, from [API Configuration](page.api_configuration) open the fallback section, enter base URL, model, and API key, then enable fallback; EmberDesk must show a ready enabled state with cost warning while hiding the saved key as a raw setting, refresh or reopen must keep the configured readiness without exposing the secret, and failure is fallback shown as ready with missing fields, lost settings, or leaked secret text.
- As a cautious user who wants fallback configured but inactive, from the fallback section fill fields and leave the enable toggle off or disable it later; EmberDesk must preserve the visible configuration while making fallback inactive, later re-enable must restore readiness, and failure is automatic fallback use while the section is disabled.
- As a user whose fallback key save fails, from the fallback API key input attempt to save and receive an error; EmberDesk must keep the entered key visible in that input for retry or copying, leave the section not-ready until save succeeds, and failure is clearing the typed secret or reporting readiness after failed save.

## Feature-Specific Evidence

- Visible enabled/disabled/readiness state, warning copy, and key placeholder behavior are primary evidence.
- Secret storage checks are supporting evidence only when the UI proves the raw fallback key is not exposed after save.
- Automatic use of the fallback provider is proven under [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery), not by this configuration feature alone.

## Failure Signals

- The section can be enabled and shown ready without a base URL, model, or saved key.
- Connection profiles overwrite, capture, or silently clear fallback fields.
- Saving the fallback secret fails and the entered value disappears.
- The UI hides the cost warning while fallback is enabled.

## Boundaries

- Main provider base URL and API key handling belongs to [Custom Base URL](feature.custom_base_url).
- Named profile switching belongs to [Connection Profile](feature.connection_profile).
- Retry sequencing and fallback attempt timing belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
