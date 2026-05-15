---
id: feature.custom_base_url
type: feature
name: Custom Base URL
related: [page.api_configuration, feature.connection_profile]
---

# Feature: Custom Base URL

## ID 解释

`feature.custom_base_url` represents the collapsible section in the API configuration drawer that contains the base URL input and the unified API key input. It covers the Custom Base URL drawer header, the URL input with its /v1 hint, the API key input with show/hide toggle, and the automatic credential routing between proxy mode and direct mode. It does not cover provider-specific authentication flows (e.g., Vertex AI service account) or connection profile management.

## Feature Purpose

This feature lets a user point EmberDesk at any OpenAI-compatible API endpoint and authenticate with a single key, whether the endpoint is the official provider API or a third-party gateway (one-api, New API, etc.).

## Trigger Entry

- **Primary entry**: expand the "Custom Base URL" drawer in the API configuration panel.

## Interaction IDs

- `feature.custom_base_url.expand`: opening the drawer.
- `feature.custom_base_url.base_url_input`: entering or clearing the base URL.
- `feature.custom_base_url.api_key_input`: entering the API key or gateway password.
- `feature.custom_base_url.api_key_toggle`: revealing or hiding the API key text.

## User Flow

1. User opens the API configuration panel.
2. User expands the "Custom Base URL" drawer.
3. **Proxy mode**: user enters a gateway URL (e.g., `https://my-gateway.example.com/v1`) and the gateway password in the API Key field.
4. **Direct mode**: user leaves the base URL empty and enters the provider's API key directly in the API Key field.
5. User clicks "Connect" to validate the connection.
6. On provider switch, the API key field placeholder updates to show whether a saved key exists for the new provider.

## Business Rules And Boundaries

- When the base URL is set, the API key value is stored as `oai_settings.proxy_password` and sent to the backend as the proxy credential for all providers.
- When the base URL is empty, the API key value is saved to the server-side secret store under the current provider's `SECRET_KEYS.*` entry.
- Clearing the base URL reloads the provider's saved secret into the field placeholder; the field value is cleared.
- Entering a base URL clears the field to accept a new gateway password.
- Special provider credentials (Vertex AI service account JSON, MiniMax Group ID, Azure OpenAI deployment fields) are NOT replaced by the unified key.
- The show/hide toggle switches the input type between `password` and `text`; it does not affect the stored value.

## ID Boundary Notes

This feature is scoped to the two inputs inside the Custom Base URL drawer. Provider-specific model selection, endpoint variant selection, and connection profile management are separate features.

## Outcomes

- **Proxy mode active**: all API requests use the gateway URL and password regardless of the selected provider.
- **Direct mode active**: API requests use the provider's official endpoint and the key stored in the secret store.
- **Key saved**: the user sees a placeholder indicating a saved key exists (with label if available).
