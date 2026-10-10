---
id: page.api_configuration
type: page
name: API Configuration (Retired)
route: / (drawer: rm_api_block — retired)
related: [page.settings, page.chat_workspace, feature.custom_base_url, feature.connection_profile, feature.chat_completion_select, feature.fallback_provider]
---

# Page: API Configuration (Retired)

## ID 解释

`page.api_configuration` previously represented the API configuration drawer (`#rm_api_block`) inside the Chat Workspace — provider selection, model selection, base URL, API key entry, connection profiles, and Connect/Test actions. **The drawer, its React host component, its top-bar entry, and the connection-manager feature it hosted have been removed.** This Doc ID is retained so historical links and topology remain stable; it is no longer a live page.

## Page Purpose

Document the retirement of the API Connections drawer. All remaining provider work — base URL, API key, model, fallback model, Connect/Test actions, and connection status — is owned by the Providers tab of [Settings](page.settings), opened from the workspace shell AI Config entry as an overlay or deep-linked at `/settings?tab=providers`. Generation defaults (presets, sampling, reasoning, continue, prompt formats) persist in `oai_settings` without an editing surface; the separate AI Response Configuration drawer (`#left-nav-panel`, shell Presets entry) is retired as well.

## Retired Structure

The drawer previously exposed the primary connection path (model datalist, unified masked API key, base URL), the fallback model section, prompt post-processing, Connect/Cancel/Test actions with an online-status indicator, and the connection-profile controls injected by the connection-manager feature. None of that DOM exists anymore; provider state flows through the runtime command port (`connectProvider` / `testProviderConnection`) into the React Providers tab. Prompt post-processing is now fixed server-side behavior (always `strict`), not a provider field.

## Page-Level Semantic IDs

- `feature.custom_base_url`: the base URL and API key fields, now on [Settings](page.settings).
- `feature.connection_profile`: retired; the profile system is gone.
- `feature.chat_completion_select`: provider/model selection, now on [Settings](page.settings).
- `feature.fallback_provider`: the model-only fallback field, now on [Settings](page.settings).
- `page.settings`: sole product owner for provider fields, secrets, and connection actions.

## Included Features

!include feature.custom_base_url
!include feature.connection_profile
!include feature.chat_completion_select
!include feature.fallback_provider

## Page States And Constraints

- **Retired drawer state**: `rm_api_block`, `sys-settings-button`, and every drawer-scoped control id (`api_connection_form`, `api_button_openai`, `test_api_button`, `model_openai_select`, `api_key_unified`, `openai_reverse_proxy`, `fallback_provider_*`, `custom_prompt_post_processing`, `chat_completion_source`) are gone from `index.html`.
- **Single connection contract**: one base URL, one `api_key_openai` secret, one primary model, one fallback model sharing the same URL and key. Keyless endpoints (local gateways) still work by setting a base URL with no saved key.
- **Legacy settings**: old `proxies[]` and `selected_proxy` fields are silently ignored on load and dropped on next save; legacy `reverse_proxy` values fold into `custom_url` when `custom_url` is empty; `proxy_password`, `custom_include_*`, `fallback_provider_enabled`, `fallback_provider_base_url`, and `bind_preset_to_connection` are stripped from saved settings.
- **Legacy provider compatibility**: Google AI Studio, Google Vertex AI, PaLM, and Anthropic Claude remain retired; stored legacy sources normalize to `openai` on load and save.

## Navigation

- The workspace shell AI Config entry opens the shared [Settings](page.settings) overlay on Providers. `/settings?tab=providers` remains the full-page deep link.

## Superseded Product Entry

The API Connections drawer is fully retired. Use [Settings](page.settings) Providers tab.
