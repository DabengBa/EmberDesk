---
id: feature.fallback_provider
type: feature
name: Fallback Provider
related: [page.api_configuration, feature.connection_profile]
---

# Feature: Fallback Provider

## ID 解释

`feature.fallback_provider` represents the optional fallback model inside the API configuration drawer. It covers the fallback model input and its readiness status. The fallback attempt reuses the primary connection's base URL and API key; there is no separate fallback endpoint, secret, or enable toggle. It does not cover general connection profiles or non-OpenAI-compatible protocols.

## Purpose

Let a user name one fallback model that eligible visible-chat recovery may retry with after the primary provider retry is exhausted, without configuring a second endpoint or credential.

## User-Visible Contract

- The fallback section lives inside [API Configuration](page.api_configuration) next to the primary model.
- Fallback is enabled by a non-empty fallback model and disabled by leaving the field empty; there is no separate toggle.
- The fallback attempt always reuses the same base URL and the same `api_key_openai` secret as the primary request; the UI never offers a fallback URL, fallback key, or fallback secret controls.
- The section shows a readiness state (`Ready` when a model is set, `Disabled` when empty) plus copy explaining that the primary URL and key apply.
- Quiet and background helpers do not consume this fallback: they return text without a visible assistant row or automatic recovery.
- Legacy `fallback_provider_enabled`/`fallback_provider_base_url`/`api_key_openai_fallback` settings and secrets are retired: the dedicated secret is deleted lazily at startup, a fallback explicitly disabled in legacy data does not resurrect, and the retired base URL is ignored.

## Semantic Interaction IDs

- `feature.fallback_provider.model`: entering or clearing the fallback model name.
- `feature.fallback_provider.status`: reading the current readiness state.

## Acceptance Workflows

- As an API-configuration user who wants a recovery model, from [API Configuration](page.api_configuration) enter a fallback model while the primary URL and key are already set; EmberDesk must show the ready state, refresh or reopen must keep the model value, and failure is fallback requests targeting a different endpoint or credential than the primary one.
- As a cautious user who wants fallback configured but inactive, leave the fallback model empty; EmberDesk must show the disabled state, no automatic fallback attempt may run, and failure is fallback use with an empty model.
- As a returning user with legacy two-endpoint fallback data, open the drawer after upgrade; EmberDesk must show only the model field with prior model value preserved when fallback was enabled, must not expose the retired URL/key inputs, and failure is resurrecting a disabled legacy fallback or keeping a usable dedicated fallback secret.

## Feature-Specific Evidence

- Visible ready/disabled state, model persistence, and the absence of fallback URL/key controls are primary evidence.
- Request payloads prove contract: the fallback attempt carries only a different `model` over the primary `custom_url` and `api_key_openai` secret.
- Automatic use of the fallback provider is proven under [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery), not by this configuration feature alone.

## Failure Signals

- A fallback request uses any URL or credential other than the primary connection's.
- Fallback runs while the fallback model field is empty.
- The UI offers a separate fallback endpoint, key, or enable toggle.
- Legacy fallback secrets survive startup cleanup.

## Boundaries

- Main provider base URL and API key handling belongs to [Custom Base URL](feature.custom_base_url).
- Named profile switching belongs to [Connection Profile](feature.connection_profile).
- Retry sequencing and fallback attempt timing belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
