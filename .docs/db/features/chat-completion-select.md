---
id: feature.chat_completion_select
type: feature
name: Chat Completion Provider and Model Select
related: [page.settings, feature.custom_base_url, feature.fallback_provider]
---

# Feature: Chat Completion Provider and Model Select

## ID 解释

`feature.chat_completion_select` represents the model input on the Providers tab of [Settings](page.settings). It covers the fixed OpenAI-compatible provider path, the Connect action that probes model availability, and typing a target model. Legacy provider sources (Google AI Studio, Anthropic Claude, Vertex AI) are normalized to OpenAI on settings load. It does not cover API key management or base URL configuration.

## Purpose

Let a user choose the chat-completion provider and model that visible chat requests will use, while keeping provider-specific settings visibly aligned with that choice.

## User-Visible Contract

- The provider contract in [Settings](page.settings) offers the single OpenAI-compatible path; there is no provider dropdown.
- The model field accepts a typed model ID without requiring a successful model-list request. Connect reports success and the returned model count when available; it never replaces the entered model with the first discovered model.
- Connect/Test use the visible draft URL and model on both Settings entry points. Draft feedback does not change the saved connection; requests started for an older configuration do not overwrite the current workspace configuration.
- New installations default to OpenAI chat completion; legacy API types are visibly normalized to the current chat-completion path on load.
- Google AI Studio (`makersuite`), Google Vertex AI (`vertexai`), PaLM (`palm`), and Anthropic Claude (`claude`) are legacy provider sources. Stored legacy sources are normalized to OpenAI (`openai`) on settings load and save; legacy `claude_model`/`assistant_prefill`/`google_model` keys stay stored but inert, and stored `api_key_claude`/`api_key_makersuite` secrets remain readable and deletable but are no longer shown as named provider credentials.

## Semantic Interaction IDs

- `feature.chat_completion_select.source_change`: switching the chat-completion source.
- `feature.chat_completion_select.model_change`: typing a model in the provider's input.
- `feature.chat_completion_select.model_list_refresh`: probing model availability for a provider that supports listing.

## Acceptance Workflows

- As a user configuring chat completions, from the Providers tab of [Settings](page.settings) type a model and save; EmberDesk must use that saved model for later chat requests and retain it after reopening. Testing a different unsaved model must not replace it.
- As a user whose provider model list is not loaded, from the Providers tab click Connect or type a model ID manually; EmberDesk must report the connection result and leave manual model entry usable, retry after a connection failure must remain possible, and failure is blocking model entry because the list is empty.
- As a user with a saved legacy Google or Vertex AI configuration, from React [Settings](page.settings) open provider settings and save; EmberDesk must display the provider as OpenAI and persist `openai` as the chat completion source, and failure is a saved source that still names the legacy provider.

## Feature-Specific Evidence

- Model input value, connection feedback, and persisted reopen state are primary evidence.
- Network model-list responses and provider setting fields are supporting evidence only after the UI reflects the correct provider.
- React settings compatibility proof should confirm that legacy `vertexai`/`makersuite`/`palm`/`claude` sources load as OpenAI and save back as `openai`.

## Failure Signals

- Connecting an unsaved draft changes the active workspace model or silently selects the first discovered model.
- Empty or failed model listing prevents manual model id entry.
- Legacy Vertex AI, Google AI Studio, PaLM, or Claude settings keep targeting a legacy provider after save instead of normalizing to OpenAI.
- The UI shows one provider while the next visible chat request uses another.

## Boundaries

- Base URL and unified API key handling belong to [Custom Base URL](feature.custom_base_url).
- The React settings page placement belongs to [Settings](page.settings).
