---
id: feature.custom_base_url
type: feature
name: Custom Base URL
related: [page.settings, feature.chat_completion_select, feature.fallback_provider]
---

# Feature: Custom Base URL

## ID 解释

`feature.custom_base_url` describes the OpenAI-compatible connection fields in [Settings](page.settings) that let a user send [Chat Completion](feature.chat_completion_select) requests to a self-hosted or gateway endpoint. It covers one endpoint, one credential, one model name, and the optional [Fallback Provider](feature.fallback_provider) model field; it does not cover model-list discovery or request recovery.

## Purpose

Let a user point chat completions at an OpenAI-compatible service of their choosing without creating multiple competing credentials or endpoint fields.

## User-Visible Contract

- The connection section presents one endpoint field, one credential field, one model field, and, when needed, one fallback model field.
- The endpoint field is optional. Leaving it empty uses EmberDesk's own completion endpoint; entering one replaces it for all completion requests that use this configuration.
- The credential field is optional. Gateways that do not require a key can be used without entering one.
- The credential is masked after it is saved, and reconnecting or testing does not create a second credential field.
- Connecting or testing reports success or failure in the same connection area. A failed test leaves the current saved configuration unchanged.
- Earlier proxy fields are folded into this one endpoint field. They do not remain as a second place to configure a destination or credential.

## Semantic Interaction IDs

- `feature.custom_base_url.base_url_input`: entering or clearing the base URL.
- `feature.custom_base_url.api_key_input`: entering the API key.

## Acceptance Workflows

- As a user connecting a self-hosted OpenAI-compatible service, in [Settings](page.settings) enter its endpoint, a credential if required, and a model name, then connect; EmberDesk must keep exactly one destination and one credential, use that destination for [Chat Completion](feature.chat_completion_select), and show connection feedback without adding a second provider credential.
- As a user of a key-free gateway, in [Settings](page.settings) leave the credential empty, enter the gateway endpoint and a model name, then test the connection; EmberDesk must accept the configuration and send completion requests without requiring a key, and failure is a required-key error or a second credential field appearing.
- As a user returning to the built-in endpoint, in [Settings](page.settings) clear the endpoint field and reconnect; EmberDesk must send subsequent completion requests to the default destination, while the typed model name remains available, and failure is the old custom destination continuing to receive requests.
- As a user with an earlier proxy configuration, open [Settings](page.settings); EmberDesk must present the earlier destination through the single endpoint field, must not require the user to re-enter it in a second field, and must not expose the saved credential as a separate named provider.

## Failure Signals

- More than one endpoint or credential field becomes visible for [Chat Completion](feature.chat_completion_select).
- Leaving the endpoint empty does not use the default destination, or entering one does not route completion requests there.
- A gateway that needs no key cannot connect without one, or a saved credential is shown in clear text.
- A failed connection test changes the saved configuration or leaves a stale success message.
- An earlier proxy configuration reappears as a separate destination or credential.

## Boundaries

- Covers only the single OpenAI-compatible endpoint, credential, model, and fallback-model fields in [Settings](page.settings).
- Does not cover model-list discovery; see [Chat Completion Provider and Model Select](feature.chat_completion_select).
- Does not cover automatic retry or quiet/background model use; see [Fallback Provider](feature.fallback_provider) and [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
