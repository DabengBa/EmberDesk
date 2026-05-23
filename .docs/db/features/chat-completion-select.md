---
id: feature.chat_completion_select
type: feature
name: Chat Completion Provider and Model Select
related: [page.api_configuration, feature.custom_base_url]
---

# Feature: Chat Completion Provider and Model Select

## ID 解释

`feature.chat_completion_select` represents the provider dropdown (`#chat_completion_source`) and the per-provider model selection dropdowns in the API configuration drawer. It covers switching between chat completion sources (OpenAI, Claude, Gemini, Mistral, DeepSeek, xAI, etc.), loading model lists, and selecting a target model. It does not cover API key management, base URL configuration, or connection profile switching.

## Feature Purpose

This feature lets a user choose which LLM provider and model to use for chat completions, and handles the UI transitions when switching between providers.

## Trigger Entry

- **Primary entry**: select a provider from the chat completion source dropdown.
- **Secondary entry**: select a model from the provider-specific model dropdown.

## Interaction IDs

- `feature.chat_completion_select.source_change`: switching the chat completion source.
- `feature.chat_completion_select.model_change`: selecting a model from the provider's dropdown.
- `feature.chat_completion_select.model_list_refresh`: fetching an updated model list from the API.

## User Flow

1. User selects a chat completion source from the dropdown (e.g., "OpenAI", "Claude", "Google AI Studio").
2. The UI shows/hides the corresponding provider section (model dropdown, endpoint variant, etc.).
3. If the provider supports model listing, user clicks "Connect" to fetch available models.
4. User selects a model from the dropdown.
5. The selected model is used for subsequent chat completion requests.

## Business Rules And Boundaries

- The default chat completion source for new installations is `openai` (Chat Completion).
- Legacy API types (`kobold`, `koboldhorde`, `novel`, `poe`) are redirected to `openai` on load.
- Some providers have endpoint variant selectors (e.g., SiliconFlow Global vs China, Z.AI Common vs Coding).
- Some providers have auth mode selectors (e.g., Vertex AI Express vs Service Account).
- The model list may be empty until the user connects to the API; a "-- Connect to the API --" placeholder is shown.
- External models (provided by the API but not in the built-in list) can be shown via the "Show External models" checkbox.

## ID Boundary Notes

This feature covers the provider and model selection UI only. The actual API request construction, credential routing, and response handling are separate concerns in the openai.js backend flow.

## Outcomes

- **Source changed**: the UI reflects the new provider's available controls and model list.
- **Model selected**: subsequent chat requests target the chosen model on the chosen provider.
