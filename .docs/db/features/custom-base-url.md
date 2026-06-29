---
id: feature.custom_base_url
type: feature
name: Custom Base URL
related: [page.api_configuration, feature.connection_profile]
---

# Feature: Custom Base URL

## ID 解释

`feature.custom_base_url` represents the collapsible section in the API configuration drawer that contains the base URL input and the unified API key input. It covers the Custom Base URL drawer header, the URL input with its /v1 hint, the API key input with show/hide toggle, and the automatic credential routing between proxy mode and direct mode. It does not cover provider-specific authentication flows (e.g., Vertex AI service account) or connection profile management.

## Purpose

Let a user point the chat-completion connection at an OpenAI-compatible base URL or return to the provider's direct endpoint while using one visible key input.

## User-Visible Contract

- The Custom Base URL drawer in [API Configuration](page.api_configuration) exposes the base URL input, the unified API key input, and the key reveal/hide control.
- When the base URL is filled, the drawer presents proxy/gateway mode: the key field represents the gateway password for the configured endpoint.
- When the base URL is empty, the drawer presents direct-provider mode: the key field saves or reflects the selected provider's secret-backed API key.
- Switching between proxy and direct mode clears the active key field value and updates placeholder text so the user does not accidentally send a provider key to a gateway or a gateway password to a provider.
- Provider-specific credentials such as Vertex AI service-account JSON, MiniMax group ID, and Azure deployment fields remain outside this unified key path.
- The reveal/hide control affects only the visible key text, not the stored credential.

## Semantic Interaction IDs

- `feature.custom_base_url.expand`: opening the Custom Base URL drawer.
- `feature.custom_base_url.base_url_input`: entering or clearing the base URL.
- `feature.custom_base_url.api_key_input`: entering the API key or gateway password.
- `feature.custom_base_url.api_key_toggle`: revealing or hiding the key text in the drawer.

## Acceptance Workflows

- As a user connecting through an OpenAI-compatible gateway, from [API Configuration](page.api_configuration) open Custom Base URL, enter the gateway URL and key, then connect; EmberDesk must show proxy-mode fields and use that gateway state for later chat connections, refresh or reopen must preserve the gateway configuration without exposing the raw key as ordinary text, and failure is direct-provider credentials being used or leaked in proxy mode.
- As a user returning to the official provider endpoint, from the same drawer clear the base URL and provide the provider key; EmberDesk must clear the gateway password entry, show provider-secret placeholder state, and after refresh or reconnect use direct-provider mode, with failure signaled by gateway password carryover or missing saved-key feedback.
- As a user switching providers after saving keys, from the provider selector change provider while Custom Base URL is empty and reopen the drawer; EmberDesk must update the key placeholder for the selected provider and keep the field value cleared until the user types a new key, and failure is showing the previous provider's secret as the current typed value.
- As a user checking a key before saving, from the drawer press the reveal/hide control; EmberDesk must reveal and re-mask only the visible key field without changing saved credential state, and failure is altered key value or persisted reveal state after refresh.

## Feature-Specific Evidence

- Drawer mode, base URL value, key placeholder, visible key masking, and successful reconnect feedback are primary evidence.
- Secret-store entries and settings payloads are supporting evidence for the same mode boundary.
- Connection profile captures can support proof only when the visible drawer still reflects the correct proxy/direct state after apply.

## Failure Signals

- Clearing the base URL leaves a gateway password in the visible key field.
- Entering a base URL sends a provider secret to a gateway without an explicit new key entry.
- Provider switch exposes a saved raw secret as typed text.
- Special provider credentials are hidden, overwritten, or treated as the unified key.

## Boundaries

- Provider and model selection belongs to [Chat Completion Provider and Model Select](feature.chat_completion_select).
- Named snapshot behavior belongs to [Connection Profile](feature.connection_profile).
- Fallback endpoint credentials belong to [Fallback Provider](feature.fallback_provider).
- The API drawer layout belongs to [API Configuration](page.api_configuration).
