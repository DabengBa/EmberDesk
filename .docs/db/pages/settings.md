---
id: page.settings
type: page
name: Settings
route: /settings
related: [page.api_configuration, page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider]
---

# Page: Settings

## ID 解释

`page.settings` represents the standalone React settings page at `/settings`. It covers the feature-flagged React route, the General, Providers, User Interface, and Advanced tabs, the coverage ledger, and the save flow for the Sprint 3 React-owned settings slice. It does not cover World Info, Backgrounds, Extensions, Persona Management, legacy drawer hosting, or backend-only configuration.

## Page Purpose

This page lets an authenticated user edit the main Sprint 3 settings slice from one standalone route instead of hunting through several legacy drawers. It is a migration surface: React owns only the fields shown in its coverage ledger and preserves everything else for the legacy workspace.

## Page Structure (UI Layout)

1. **Header and tabs**: the page opens with a Settings heading, a short migration summary, and four tabs: General, Providers, User Interface, and Advanced.
2. **General tab**: shows chat-completion defaults such as preset, context, max response, sampling, streaming, web search, function calling, reasoning effort, continue behavior, and prompt post-processing.
3. **Providers tab**: shows provider/model selection, reverse proxy and custom connection fields, Google Vertex AI controls, fallback provider controls, and provider/fallback secret controls.
4. **User Interface tab**: shows theme, chat width, font scale, custom CSS, MovingUI, notification position, avatar style, chat display, and message visibility toggles.
5. **Advanced tab**: shows system/context/instruct template fields, stop strings, tokenizer, auto-swipe, auto-continue, streaming, reasoning, and STscript controls.
6. **Right-side ledger**: the sidebar lists React-owned settings paths, still-legacy-owned paths, and a small payload snapshot so users and reviewers can see the migration boundary.
7. **Save bar**: the bottom action row explains that the page submits the full settings object while only changing React-owned fields; the save button stays disabled until the form is modified.

## Page-Level Semantic IDs

- `feature.chat_completion_select`: provider and model selection visible in the Providers tab.
- `feature.custom_base_url`: reverse proxy, custom URL, and direct provider secret routing visible in the Providers tab.
- `feature.fallback_provider`: fallback provider configuration and dedicated fallback secret controls visible in the Providers tab.
- `page.api_configuration`: the legacy drawer that still owns service-account JSON, connection profile behavior, and fields not yet exposed on React `/settings`.
- `page.chat_workspace`: the legacy root workspace used when the settings feature flag is off or the React build is unavailable.

## Included Features

!include feature.chat_completion_select
!include feature.custom_base_url
!include feature.fallback_provider

## Page States And Constraints

- **React route state**: `/settings` serves the React shell only when `features.react.pages.settings` is enabled and the React build exists.
- **Fallback state**: if the flag is off or the React build is missing, `/settings` redirects to [Chat Workspace](page.chat_workspace) so the legacy settings surfaces remain available.
- **Workspace shell fallback entry state**: from the same-entry React workspace chrome, the Settings entry navigates to `/settings` only when this React route is enabled; otherwise it opens the existing User Settings drawer in [Chat Workspace](page.chat_workspace) and participates in the same active-entry close/reopen behavior as other shell-controlled legacy panels.
- **Auth state**: unauthenticated users are redirected to the login page before seeing settings.
- **Dirty state**: the save button is disabled on a freshly loaded form and becomes available only after the user changes a React-owned field.
- **Save state**: saving submits the complete settings object but only rewrites fields listed in the React-owned coverage ledger.
- **Secret state**: provider and fallback keys continue to use the server-side secret store; they are not written into the normal settings save payload.
- **Vertex AI state**: a legacy `vertexai` provider setting is shown as Google with Vertex AI enabled. Saving without disabling Vertex AI keeps the legacy Vertex AI source intact; disabling Vertex AI saves the source as normal Google.
- **Reasoning effort state**: existing advanced reasoning effort values such as `minimal`, `min`, `max`, `none`, and `xhigh` remain visible and saveable instead of being coerced to the basic low/medium/high set.
- **Legacy-owned state**: World Info, Backgrounds, Extensions, Persona Management, text-generation globals, connection-profile details, theme color tokens, tags, and other ledger-listed paths remain outside this page.

## Navigation

- `/settings` is a standalone route for authenticated users.
- When React settings is unavailable, users continue from [Chat Workspace](page.chat_workspace).
- From the React workspace chrome, the Settings entry uses this route only when available and otherwise stays in the workspace drawer fallback.
- Legacy provider and credential surfaces remain reachable through [API Configuration](page.api_configuration).
