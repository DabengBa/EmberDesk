---
id: feature.chat_completion_select
type: feature
name: Chat Completion Provider and Model Select
related: [page.api_configuration, feature.custom_base_url]
---

# Feature: Chat Completion Provider and Model Select

## ID 解释

`feature.chat_completion_select` represents the provider dropdown (`#chat_completion_source`) and the per-provider model inputs in the API configuration drawer. It covers switching between the current chat-completion sources (OpenAI, Claude, Google AI Studio, and Google Vertex AI mode), loading model lists into datalists, and selecting or typing a target model. It does not cover API key management, base URL configuration, or connection profile switching.

## Feature Purpose

This feature lets a user choose which LLM provider and model to use for chat completions, and handles the UI transitions when switching between providers.

## Trigger Entry

- **Primary entry**: select a provider from the chat completion source dropdown.
- **Secondary entry**: select or type a model in the provider-specific model input.

## Interaction IDs

- `feature.chat_completion_select.source_change`: switching the chat completion source.
- `feature.chat_completion_select.model_change`: selecting or typing a model in the provider's input.
- `feature.chat_completion_select.model_list_refresh`: fetching an updated model list from the API.

## User Flow

1. User selects a chat completion source from the dropdown (`OpenAI`, `Claude`, or `Google`).
2. The UI shows/hides the corresponding provider section and model input.
3. If the provider supports model listing, user clicks "Connect" to fetch available models.
4. User selects a model from the datalist-backed input or types a model id.
5. The selected model is used for subsequent chat completion requests.

## Business Rules And Boundaries

- The default chat completion source for new installations is `openai` (Chat Completion).
- Legacy API types (`kobold`, `koboldhorde`, `novel`, `poe`) are redirected to `openai` on load.
- Google can switch into Vertex AI mode, which exposes Express API-key and full Service Account JSON credential paths.
- In React [Settings](page.settings), an existing legacy `vertexai` source is displayed as Google with Vertex AI enabled; saving preserves that source unless the user turns Vertex AI off.
- The model list may be empty until the user connects to the API; model inputs still allow a typed model id.

## ID Boundary Notes

This feature covers the provider and model selection UI only. The actual API request construction, credential routing, and response handling are separate concerns in the openai.js backend flow.

## Outcomes

- **Source changed**: the UI reflects the new provider's available controls and clears the stale model list before reloading.
- **Model selected**: subsequent chat requests target the chosen model on the chosen provider.
