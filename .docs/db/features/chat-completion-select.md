---
id: feature.chat_completion_select
type: feature
name: Chat Completion Provider and Model Select
related: [page.api_configuration, feature.custom_base_url]
---

# Feature: Chat Completion Provider and Model Select

## ID 解释

`feature.chat_completion_select` represents the model input on the Providers tab of [Settings](page.settings). It covers the fixed OpenAI-compatible provider path, the Connect action that refreshes the model list, and selecting or typing a target model. Retired providers (Google AI Studio, Anthropic Claude, Vertex AI) are normalized to OpenAI on settings load. It does not cover API key management or base URL configuration; connection profiles are retired.

## Purpose

Let a user choose the chat-completion provider and model that visible chat requests will use, while keeping provider-specific settings visibly aligned with that choice.

## User-Visible Contract

- The provider contract in [Settings](page.settings) offers the single OpenAI-compatible path; there is no provider dropdown.
- The active provider's model input accepts either a model chosen from a refreshed list or a typed model id when no list is available.
- Changing provider clears stale model-list UI so users do not mistake a previous provider's model list for the current provider.
- New installations default to OpenAI chat completion; legacy API types are visibly normalized to the current chat-completion path on load.
- Google AI Studio (`makersuite`), Google Vertex AI (`vertexai`), PaLM (`palm`), and Anthropic Claude (`claude`) are retired as providers. Stored legacy sources are normalized to OpenAI (`openai`) on settings load and save; legacy `claude_model`/`assistant_prefill`/`google_model` keys stay stored but inert, and stored `api_key_claude`/`api_key_makersuite` secrets remain readable and deletable but are no longer shown as named provider credentials.

## Semantic Interaction IDs

- `feature.chat_completion_select.source_change`: switching the chat-completion source.
- `feature.chat_completion_select.model_change`: selecting or typing a model in the provider's input.
- `feature.chat_completion_select.model_list_refresh`: refreshing the visible model list for a provider that supports listing.

## Acceptance Workflows

- As a user configuring chat completions, from the Providers tab of [Settings](page.settings) choose or type a model; EmberDesk must show the matching provider controls and use that visible provider/model choice for later chat requests, refresh or reopen must not restore stale controls from the previous provider, and failure is mixed provider UI, stale model list, or a chat request visibly targeting the old model.
- As a user whose provider model list is not loaded, from the Providers tab click Connect or type a model id manually; EmberDesk must either populate the model list or leave manual model entry usable, retry after a connection failure must remain possible, and failure is blocking model entry because the list is empty.
- As a user with a saved legacy Google or Vertex AI configuration, from React [Settings](page.settings) open provider settings and save; EmberDesk must display the provider as OpenAI and persist `openai` as the chat completion source, and failure is a saved source that still names the retired provider.

## Feature-Specific Evidence

- Visible provider sections, model input value, refreshed model options, and persisted reopen state are primary evidence.
- Network model-list responses and provider setting fields are supporting evidence only after the UI reflects the correct provider.
- React settings compatibility proof should confirm that legacy `vertexai`/`makersuite`/`palm`/`claude` sources load as OpenAI and save back as `openai`.

## Failure Signals

- Provider switch leaves controls or model options from the previous provider visible as current.
- Empty or failed model listing prevents manual model id entry.
- Legacy Vertex AI, Google AI Studio, PaLM, or Claude settings keep targeting a retired provider after save instead of normalizing to OpenAI.
- The UI shows one provider while the next visible chat request uses another.

## Boundaries

- Base URL and unified API key handling belong to [Custom Base URL](feature.custom_base_url).
- Named profile switching is retired with [Connection Profile](feature.connection_profile).
- The React settings page placement belongs to [Settings](page.settings); the legacy drawer ([API Configuration](page.api_configuration)) is retired.
