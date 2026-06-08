---
id: page.api_configuration
type: page
name: API Configuration
route: / (drawer: rm_api_block)
related: [feature.custom_base_url, feature.connection_profile, feature.chat_completion_select, feature.fallback_provider]
---

# Page: API Configuration

## ID 解释

`page.api_configuration` represents the API configuration drawer inside the Chat Workspace. It covers provider selection, model selection, custom base URL, API key management, and connection profiles. It does not cover backend server configuration, environment variables, or Docker-level networking.

## Page Purpose

This page exists so a user can configure how EmberDesk connects to an LLM API provider: which provider to use, which model to target, and what credentials and endpoint to use for the connection.

## Page Structure (UI Layout)

1. **Provider and model row**: Chat Completion provider selector (`OpenAI`, `Claude`, `Google`) plus the matching provider-specific model input backed by a datalist.
2. **Unified credential row**: masked API key input with a visibility toggle.
3. **Custom Base URL row**: optional base URL input shared by supported chat-completion providers.
4. **Fallback provider section**: optional OpenAI-compatible fallback base URL, model, enabled toggle, secret-backed API key controls, and cost warning inside the same drawer.
5. **Provider-specific section**: controls such as Vertex AI mode, credential type, region, and service account JSON shown when the selected provider needs them.
6. **Prompt post-processing section**: collapsible selector for prompt post-processing behavior.
7. **Connection actions**: Connect, Cancel, Additional Parameters, Test, and connection-status feedback.
8. **Preset and sampling sections**: preset dropdown/actions, streaming, context/response limits, feature toggles, prompt manager, advanced sampling, image generation, and settings controls.

## Page-Level Semantic IDs

- `feature.custom_base_url`: the base URL and unified API key inputs inside the Custom Base URL drawer.
- `feature.connection_profile`: creating, applying, and switching named configuration snapshots.
- `feature.chat_completion_select`: selecting the chat completion source and model.
- `feature.fallback_provider`: configuring the optional OpenAI-compatible fallback provider and its dedicated secret.

## Included Features

!include feature.custom_base_url
!include feature.connection_profile
!include feature.chat_completion_select
!include feature.fallback_provider

## Page States And Constraints

- **Default state**: OpenAI is the default chat-completion provider for new installations.
- **Proxy mode**: when a custom base URL is entered, the unified API key acts as the gateway password for all providers.
- **Direct mode**: when the base URL is empty, the unified API key stores the current provider's secret key in the server-side secret store.
- **Provider switch**: changing the chat completion source updates the unified key field placeholder to reflect whether a saved key exists for the new provider.
- **Legacy settings**: old `proxies[]` and `selected_proxy` fields in settings files are silently ignored on load and dropped on next save; legacy main API values such as `kobold`, `koboldhorde`, `novel`, `poe`, and `textgenerationwebui` are redirected to the OpenAI chat-completion path during settings load.
- **Fallback provider state**: the optional fallback provider lives in the same drawer, persists as ordinary settings plus a dedicated server-side secret, preserves the entered fallback key when save fails, and stays independent from connection profile capture/apply behavior.

## Navigation

- This drawer is accessed from the [Chat Workspace](page.chat_workspace) sidebar.
- Connection profiles can be switched without leaving the page.
