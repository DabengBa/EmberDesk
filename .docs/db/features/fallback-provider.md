---
id: feature.fallback_provider
type: feature
name: Fallback Provider
related: [page.api_configuration, feature.connection_profile]
---

# Feature: Fallback Provider

## ID 解释

`feature.fallback_provider` represents the optional OpenAI-compatible fallback connection that lives inside the API configuration drawer. It covers the fallback enabled toggle, base URL, model, secret-backed API key controls, and the visible cost warning. It does not cover general connection profiles, provider routing, or non-OpenAI-compatible protocols.

## Feature Purpose

This feature lets a user preconfigure a second OpenAI-compatible endpoint that EmberDesk can use only when main-chat automatic recovery needs a fallback attempt.

## Trigger Entry

- **Primary entry**: open the fallback provider section inside [API Configuration](page.api_configuration).

## Interaction IDs

- `feature.fallback_provider.enabled`: enabling or disabling fallback use.
- `feature.fallback_provider.base_url`: entering the fallback endpoint.
- `feature.fallback_provider.model`: entering the fallback model name.
- `feature.fallback_provider.api_key`: saving or clearing the dedicated fallback secret.
- `feature.fallback_provider.status`: reading the current readiness state.

## User Flow

1. The user opens the API configuration drawer.
2. The user fills in the fallback base URL, model, and dedicated API key.
3. The user enables fallback use when ready.
4. EmberDesk keeps the fallback settings and secret available for later automatic recovery attempts.
5. When visible main-chat generation fails, EmberDesk may temporarily use the fallback provider once after the primary retry is exhausted.

## Business Rules And Boundaries

- The fallback provider is OpenAI-compatible only.
- The fallback API key is stored in the dedicated server-side secret entry and is not written into the normal settings payload as plain text.
- The fallback provider is not a connection profile and is not captured or applied by profile switching.
- Fallback use stays disabled until the user enables it and provides the required base URL, model, and secret.
- The cost warning stays visible so the user understands fallback use can create extra API requests and charges.

## ID Boundary Notes

This feature is separate from [Custom Base URL](feature.custom_base_url) because it is optional recovery infrastructure, not the main provider credential path. It is also separate from [Connection Profile](feature.connection_profile) because profile switching does not own its persistence.

## Outcomes

- **Ready state**: the fallback provider is enabled and fully configured.
- **Incomplete state**: one or more required fields are missing, so the fallback provider cannot be used.
- **Disabled state**: the section remains configured but inactive until the user turns it on.
