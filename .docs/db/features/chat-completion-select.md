---
id: feature.chat_completion_select
type: feature
name: Chat Completion Provider and Model Select
related: [page.api_configuration, feature.custom_base_url]
---

# Feature: Chat Completion Provider and Model Select

## ID 解释

`feature.chat_completion_select` represents the provider dropdown (`#chat_completion_source`) and the per-provider model inputs in the API configuration drawer. It covers switching between the current chat-completion sources (OpenAI and Google AI Studio), loading model lists into datalists, and selecting or typing a target model. It does not cover API key management, base URL configuration, or connection profile switching.

## Purpose

Let a user choose the chat-completion provider and model that visible chat requests will use, while keeping provider-specific settings visibly aligned with that choice.

## User-Visible Contract

- The provider dropdown in [API Configuration](page.api_configuration) switches the visible provider controls for OpenAI-compatible and Google AI Studio.
- The active provider's model input accepts either a model chosen from a refreshed list or a typed model id when no list is available.
- Changing provider clears stale model-list UI so users do not mistake a previous provider's model list for the current provider.
- New installations default to OpenAI chat completion; legacy API types are visibly normalized to the current chat-completion path on load.
- Google Vertex AI is retired as a provider. A stored legacy `vertexai` source is normalized to Google AI Studio (`makersuite`) on settings load and stays Google AI Studio after save.
- Anthropic Claude is retired as a provider. A stored legacy `claude` source is normalized to OpenAI (`openai`) on settings load, legacy `claude_model`/`assistant_prefill`/`assistant_impersonation` keys stay stored but inert, and a stored `api_key_claude` secret remains readable and deletable but is no longer shown as a named provider credential.

## Semantic Interaction IDs

- `feature.chat_completion_select.source_change`: switching the chat-completion source.
- `feature.chat_completion_select.model_change`: selecting or typing a model in the provider's input.
- `feature.chat_completion_select.model_list_refresh`: refreshing the visible model list for a provider that supports listing.

## Acceptance Workflows

- As a user configuring chat completions, from [API Configuration](page.api_configuration) switch the provider dropdown and choose or type a model; EmberDesk must show the matching provider controls and use that visible provider/model choice for later chat requests, refresh or reopen must not restore stale controls from the previous provider, and failure is mixed provider UI, stale model list, or a chat request visibly targeting the old model.
- As a user whose provider model list is not loaded, from the active provider section click Connect or type a model id manually; EmberDesk must either populate the model list or leave manual model entry usable, retry after a connection failure must remain possible, and failure is blocking model entry because the list is empty.
- As a user with a saved legacy Vertex AI configuration, from React [Settings](page.settings) open provider settings and save; EmberDesk must display the provider as Google and persist `makersuite` as the chat completion source, and failure is a saved source that still names the retired provider.

## Feature-Specific Evidence

- Visible provider sections, model input value, refreshed model options, and persisted reopen state are primary evidence.
- Network model-list responses and provider setting fields are supporting evidence only after the UI reflects the correct provider.
- React settings compatibility proof should confirm a legacy `vertexai` source loads as Google and saves back as `makersuite`, and that a legacy `claude` source loads as OpenAI and saves back as `openai`.

## Failure Signals

- Provider switch leaves controls or model options from the previous provider visible as current.
- Empty or failed model listing prevents manual model id entry.
- Legacy Vertex AI settings keep targeting the retired provider after save instead of normalizing to Google AI Studio.
- Legacy Claude settings keep targeting the retired provider after save instead of normalizing to OpenAI.
- The UI shows one provider while the next visible chat request uses another.

## Boundaries

- Base URL and unified API key handling belong to [Custom Base URL](feature.custom_base_url).
- Named profile switching belongs to [Connection Profile](feature.connection_profile).
- The legacy drawer and React settings page placement belong to [API Configuration](page.api_configuration) and [Settings](page.settings).
