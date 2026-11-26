---
id: feature.chat_completion_select
type: feature
name: Chat Completion Provider and Model Select
related: [page.settings, feature.custom_base_url, feature.fallback_provider]
---

# Feature: Chat Completion Provider and Model Select

## ID 解释

`feature.chat_completion_select` represents the model input on the Providers tab of [Settings](page.settings). It covers the single OpenAI-compatible provider path, the Connect action that checks model availability, and typing a target model. Earlier provider choices are presented as the current chat-completion path when settings are opened. It does not cover credential management or endpoint configuration; see [Custom Base URL](feature.custom_base_url).

## Purpose

Let a user choose the model that visible chat requests will use while keeping the provider-facing settings aligned with that choice.

## User-Visible Contract

- The provider contract in [Settings](page.settings) offers a single OpenAI-compatible path; there is no provider dropdown.
- The model field accepts a typed model name without requiring a successful model-list request. Connect reports success and the returned model count when available; it never replaces the entered model with the first discovered model.
- Connect and Test use the visible draft endpoint and model on both Settings entry points. Draft feedback does not change the saved connection; requests started for an older configuration do not overwrite the current workspace configuration.
- New installations use the current chat-completion path by default; earlier provider choices are visibly normalized to that path on load and on save.
- Earlier Google AI Studio, Google Vertex AI, PaLM, and Anthropic Claude configurations are presented as the current chat-completion provider. Their old model fields remain stored but inert; previously stored credentials remain readable and deletable but are no longer shown as separate named provider credentials.

## Semantic Interaction IDs

- `feature.chat_completion_select.source_change`: switching the chat-completion source.
- `feature.chat_completion_select.model_change`: typing a model in the provider's input.
- `feature.chat_completion_select.model_list_refresh`: probing model availability for a provider that supports listing.

## Acceptance Workflows

- As a user configuring chat completions, from the Providers tab of [Settings](page.settings) type a model and save; EmberDesk must use that saved model for later chat requests and retain it after reopening. Testing a different unsaved model must not replace it.
- As a user whose provider model list is not loaded, from the Providers tab click Connect or type a model name manually; EmberDesk must report the connection result and leave manual model entry usable, retry after a connection failure must remain possible, and failure is blocking model entry because the list is empty.
- As a user with a saved earlier Google AI Studio or Vertex AI configuration, open provider settings in [Settings](page.settings) and save; EmberDesk must display the current chat-completion provider and persist that choice, and failure is a saved configuration that still names the earlier provider.

## Failure Signals

- Connecting an unsaved draft changes the active workspace model or silently selects the first discovered model.
- Empty or failed model listing prevents manual model entry.
- An earlier Vertex AI, Google AI Studio, PaLM, or Claude configuration keeps targeting that earlier provider after save instead of being presented as the current chat-completion path.
- The UI shows one provider or model while the next visible chat request uses another.
- An earlier provider credential reappears as a named credential field.

## Boundaries

- Endpoint and unified credential handling belong to [Custom Base URL](feature.custom_base_url).
- Automatic use of a second model belongs to [Fallback Provider](feature.fallback_provider).
- Settings placement belongs to [Settings](page.settings).
