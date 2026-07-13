---
id: page.api_configuration
type: page
name: API Configuration
route: / (drawer: rm_api_block)
related: [page.settings, page.chat_workspace, feature.custom_base_url, feature.connection_profile, feature.chat_completion_select, feature.fallback_provider]
---

# Page: API Configuration

## ID 解释

`page.api_configuration` represents the API configuration drawer inside the Chat Workspace. It covers provider selection, model selection, custom base URL, API key management, connection profiles, and legacy-only provider credential details. It does not cover backend server configuration, environment variables, Docker-level networking, or the standalone React [Settings](page.settings) route.

## Page Purpose

This page exists so a user can configure how EmberDesk connects to an LLM API provider: which provider to use, which model to target, and what credentials and endpoint to use for the connection. During the React migration it remains the legacy workspace owner for connection-profile behavior, provider-specific credential details, and fields not yet exposed on [Settings](page.settings).

## Page Structure (UI Layout)

1. **Primary connection path**: Chat Completion provider selector (`OpenAI`, `Claude`, `Google`), matching provider-specific model input backed by a datalist, unified masked API key input, and optional Base URL input grouped as the first visible task path.
2. **Fallback provider section**: optional OpenAI-compatible fallback toggle and status chip are visible by default; fallback base URL, model, secret-backed API key controls, and cost warning stay inside the same drawer but are only visually expanded when fallback is enabled.
3. **Provider-specific section**: controls such as Vertex AI mode, credential type, region, and service account JSON shown when the selected provider needs them.
4. **Prompt post-processing section**: collapsible selector for prompt post-processing behavior.
5. **Connection actions**: Connect remains the primary action; Cancel, parameters, Test, and connection-status feedback remain nearby but visually secondary.
6. **Preset and sampling sections**: preset dropdown/actions, streaming, context/response limits, feature toggles, prompt manager, advanced sampling, image generation, and settings controls.

## Page-Level Semantic IDs

- `feature.custom_base_url`: the base URL and unified API key inputs inside the Custom Base URL drawer.
- `feature.connection_profile`: creating, applying, and switching named configuration snapshots.
- `feature.chat_completion_select`: selecting the chat completion source and model.
- `feature.fallback_provider`: configuring the optional OpenAI-compatible fallback provider and its dedicated secret.
- `page.settings`: the standalone React route that now overlaps the Sprint 3 provider/model, reverse proxy, Vertex AI Express, fallback provider, and secret-state slice while keeping legacy-only provider details here.

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
- **Credential history**: saved provider credentials keep their labels and one active selection per provider key. Adding a new credential makes it active; renaming, switching, and deleting credentials keep the same visible behavior across the legacy drawer and React Settings overlap.
- **Secret visibility**: ordinary page state shows only masked values and saved/missing status. Full values remain unavailable unless the server explicitly allows the existing narrow exposure path.
- **Legacy settings**: old `proxies[]` and `selected_proxy` fields in settings files are silently ignored on load and dropped on next save; legacy main API values such as `kobold`, `koboldhorde`, `novel`, `poe`, and `textgenerationwebui` are redirected to the OpenAI chat-completion path during settings load.
- **Fallback provider state**: the optional fallback provider lives in the same drawer, persists as ordinary settings plus a dedicated server-side secret, preserves the entered fallback key when save fails, stays independent from connection profile capture/apply behavior, and keeps its advanced fields visually collapsed until the fallback toggle is enabled.
- **React settings overlap**: when `/settings` is available, users can edit the Sprint 3 React-owned provider slice there; this drawer still owns service-account JSON, connection-profile capture/apply behavior, deeper provider profile details, and any provider fields not listed in the React settings coverage ledger.
- **Workspace shell entry state**: when the React workspace chrome is mounted, its AI Config entry opens and closes this existing drawer from the shell navigation. The shell does not take ownership of provider secrets, custom base URL fields, connection profiles, API key placeholders, or unsaved values inside the drawer.
- **Vertex AI boundary**: React `/settings` owns Vertex AI Express metadata and the Vertex API-key secret state; full Service Account JSON remains in this legacy drawer.
- **Legacy provider compatibility**: users who already had Google Vertex AI selected through the legacy drawer can open React [Settings](page.settings) and see it as Google with Vertex AI enabled, then save without silently downgrading it to normal Google.

## Navigation

- This drawer is accessed from the [Chat Workspace](page.chat_workspace) sidebar.
- On builds with the same-entry React chrome enabled, the drawer is also reachable through the shell's AI Config entry and follows the shell's active-entry close/reopen behavior.
- Connection profiles can be switched without leaving the page.
- Users may use [Settings](page.settings) for the migrated standalone provider slice when the React settings feature flag and build are available.
