---
id: page.chat_workspace
type: page
name: Chat Workspace
route: /
related: [feature.startup_bootstrap, feature.character_library_panel, feature.character_delete, feature.background_library_panel, feature.extension_panel_open, term.character_card]
---

# Page: Chat Workspace

## ID 解释

`page.chat_workspace` represents EmberDesk's main in-browser working surface after the root URL finishes loading. It covers the persistent shell that users stay in while switching characters, chats, backgrounds, and extensions. It does not cover standalone installation, server startup, or backend-only maintenance tasks.

## Page Purpose

This page exists so a user can run their daily LLM workflow from one browser surface: choose a character, open or continue a chat, and adjust surrounding workspace context without leaving the main shell.

## Page Structure (UI Layout)

1. **Primary shell frame**: the always-present application chrome that becomes usable after the startup overlay disappears.
2. **Character and navigation region**: the area where users browse character cards and switch the active working context.
3. **Main chat region**: the central conversation surface where messages, generation output, and chat actions are shown.
4. **Supporting panels and drawers**: secondary UI surfaces for extensions, backgrounds, and related workspace tools.
5. **Composer and action region**: the place where users type prompts and trigger chat actions.

## Page-Level Semantic IDs

- `feature.startup_bootstrap`: the visible shell-loading experience between opening the URL and reaching a usable workspace.
- `feature.character_library_panel`: browsing and selecting character cards from the workspace.
- `feature.character_delete`: removing a character from the active library.
- `feature.background_library_panel`: opening and refreshing the background library inside the workspace.
- `feature.extension_panel_open`: opening the extensions surface and handling its loading state.
- `term.character_card`: the core object users browse and operate on in the character library.

## Included Features

!include feature.startup_bootstrap
!include feature.character_library_panel
!include feature.character_delete
!include feature.background_library_panel
!include feature.extension_panel_open

## Page States And Constraints

- **Startup state**: the shell is not yet interactive while the startup overlay is still visible.
- **Ready state**: the main shell becomes usable before every supporting panel has necessarily finished background loading.
- **Degraded state**: if a supporting surface such as extensions or backgrounds fails to load, the core shell can still remain usable and the affected panel shows local retry or follow-up refresh behavior.

## Navigation

- The workspace is the product's main destination and root route.
- From this shell, users can move between the character library, chat context, background surface, and extension surface without leaving [Chat Workspace](page.chat_workspace).
