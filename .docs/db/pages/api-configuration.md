---
id: page.api_configuration
type: page
name: API Configuration
route: / (drawer: openai / textgenerationwebui)
related: [feature.custom_base_url, feature.connection_profile, feature.chat_completion_select]
---

# Page: API Configuration

## ID 解释

`page.api_configuration` represents the API configuration drawer inside the Chat Workspace. It covers provider selection, model selection, custom base URL, API key management, and connection profiles. It does not cover backend server configuration, environment variables, or Docker-level networking.

## Page Purpose

This page exists so a user can configure how EmberDesk connects to an LLM API provider: which provider to use, which model to target, and what credentials and endpoint to use for the connection.

## Page Structure (UI Layout)

1. **API type selector**: top-level toggle between Chat Completion and Text Completion modes.
2. **Connection Profile bar**: dropdown and save/delete controls for named configuration snapshots at the top of the drawer.
3. **Custom Base URL section**: collapsible drawer containing the base URL input and the unified API key input.
4. **Preset bar**: preset dropdown with labeled action buttons (Save, Rename, Save As).
5. **Options section**: streaming toggle and other basic completion switches.
6. **Provider-specific section**: model selection dropdown and provider-specific controls (e.g., endpoint variant, auth mode). Shown/hidden based on the selected chat completion source.
7. **Features section**: reasoning effort segmented control (Auto/Low/Medium/High), image request toggles, and provider-specific feature switches.
8. **Prompt Manager section**: the inline prompt manager surface.
9. **Advanced Sampling section**: collapsible drawer containing temperature, top P, frequency penalty, presence penalty, top K, and verbosity controls. Uses slider + number-input pairs for numeric values. Verbosity uses a segmented control (Auto/Low/Medium/High).
10. **Image Generation section**: image request toggles and provider-specific image settings.
11. **Settings section**: character names behavior, group nudge, and other general chat completion options.

## Page-Level Semantic IDs

- `feature.custom_base_url`: the base URL and unified API key inputs inside the Custom Base URL drawer.
- `feature.connection_profile`: creating, applying, and switching named configuration snapshots.
- `feature.chat_completion_select`: selecting the chat completion source and model.

## Included Features

!include feature.custom_base_url
!include feature.connection_profile
!include feature.chat_completion_select

## Page States And Constraints

- **Default state**: Chat Completion is the default API type for new installations.
- **Proxy mode**: when a custom base URL is entered, the unified API key acts as the gateway password for all providers.
- **Direct mode**: when the base URL is empty, the unified API key stores the current provider's secret key in the server-side secret store.
- **Provider switch**: changing the chat completion source updates the unified key field placeholder to reflect whether a saved key exists for the new provider.
- **Legacy settings**: old `proxies[]` and `selected_proxy` fields in settings files are silently ignored on load and dropped on next save.

## Navigation

- This drawer is accessed from the [Chat Workspace](page.chat_workspace) sidebar.
- Connection profiles can be switched without leaving the page.
