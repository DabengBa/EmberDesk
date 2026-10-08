---
id: feature.custom_base_url
type: feature
name: Custom Base URL
related: [page.api_configuration, feature.connection_profile]
---

# Feature: Custom Base URL

## ID 解释

`feature.custom_base_url` represents the base URL input and the provider API key input on the Providers tab of [Settings](page.settings). It covers the optional OpenAI-compatible endpoint override (`custom_url`) and the single provider API key field with its masked saved state. It does not cover provider-specific authentication flows beyond the single key, connection profile management (retired), or any second credential.

## Purpose

Let a user point the chat-completion connection at an OpenAI-compatible base URL or return to the provider's direct endpoint, always authenticated by the same single API key.

## User-Visible Contract

- The API connection path in [Settings](page.settings) exposes exactly one base URL input, one API key input, one model input, and one fallback model input.
- The base URL input is optional; when empty the request targets the provider's default endpoint, and when filled it targets that OpenAI-compatible endpoint. In both cases the same `api_key_openai` secret authenticates the request.
- An endpoint that needs no key (for example a local gateway) works by setting a base URL and leaving the key unsaved.
- Legacy `reverse_proxy`/`proxy_password`/`custom_include_*` settings are retired: a stored reverse-proxy URL folds into `custom_url` on load when `custom_url` is empty, and the retired keys are stripped on save.

## Semantic Interaction IDs

- `feature.custom_base_url.base_url_input`: entering or clearing the base URL.
- `feature.custom_base_url.api_key_input`: entering the API key.

## Acceptance Workflows

- As a user connecting through an OpenAI-compatible endpoint, from the Providers tab of [Settings](page.settings) enter the endpoint URL and API key, then press Connect; EmberDesk must use that endpoint with that key for chat requests, refresh or reopen must preserve the configuration without exposing the raw key as ordinary text, and failure is silently dropping the endpoint or the credential.
- As a user returning to the official provider endpoint, from the same input clear the base URL; EmberDesk must target the default endpoint with the same saved key, and failure is continuing to route through the cleared URL.
- As a user with legacy proxy settings, load the workspace after upgrade; EmberDesk must surface the stored proxy URL as the base URL when no custom URL exists, must not offer a separate proxy password field, and failure is losing the endpoint or keeping a second credential path.

## Feature-Specific Evidence

- Endpoint value, the masked saved-key state, and successful Connect/Test feedback are primary evidence.
- Secret-store entries and settings payloads are supporting evidence that exactly one provider credential exists.

## Failure Signals

- The UI offers more than one URL field or more than one credential for the primary connection.
- A request sends a credential other than `api_key_openai`, or a proxy-password field reappears.
- Retired `reverse_proxy`/`proxy_password`/`custom_include_*` keys are written back on save.

## Boundaries

- Provider and model selection belongs to [Chat Completion Provider and Model Select](feature.chat_completion_select).
- Named snapshot behavior is retired with [Connection Profile](feature.connection_profile).
- Fallback model configuration belongs to [Fallback Provider](feature.fallback_provider).
- The Providers tab layout belongs to [Settings](page.settings); the legacy drawer ([API Configuration](page.api_configuration)) is retired.
