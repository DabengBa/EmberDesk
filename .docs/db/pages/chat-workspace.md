---
id: page.chat_workspace
type: page
name: Chat Workspace
route: /
related: [feature.startup_bootstrap, feature.character_library_panel, feature.character_export, feature.character_delete, feature.world_info_panel, feature.background_library_panel, feature.extension_panel_open, term.character_card, term.shared_browser_library, page.login]
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
4. **Supporting panels and drawers**: secondary UI surfaces for World Info, extensions, backgrounds, and related workspace tools.
5. **Composer and action region**: the place where users type prompts and trigger chat actions.

## Page-Level Semantic IDs

- `feature.startup_bootstrap`: the visible shell-loading experience between opening the URL and reaching a usable workspace.
- `feature.character_library_panel`: browsing and selecting character cards from the workspace.
- `feature.character_export`: exporting the active character card as PNG or JSON with keyboard-reachable format selection and visible feedback.
- `feature.character_delete`: removing a character from the active library.
- `feature.world_info_panel`: activating global World Info and editing world-book entries from the workspace drawer.
- `feature.background_library_panel`: opening and refreshing the background library inside the workspace.
- `feature.extension_panel_open`: opening the extensions surface and handling its loading state.
- `term.character_card`: the core object users browse and operate on in the character library.
- `term.shared_browser_library`: the stable browser utility surface used by first-party modules and ES-module extensions.

## Included Features

!include feature.startup_bootstrap
!include feature.character_library_panel
!include feature.character_export
!include feature.character_delete
!include feature.world_info_panel
!include feature.background_library_panel
!include feature.extension_panel_open

## Page States And Constraints

- **Startup state**: the shell is not yet interactive while the startup overlay is still visible.
- **Ready state**: the main shell becomes usable before every supporting panel has necessarily finished background loading.
- **Degraded state**: if a supporting surface such as extensions or backgrounds fails to load, the core shell can still remain usable and the affected panel shows local retry or follow-up refresh behavior.
- **Thumbnail paint state**: avatar-heavy list surfaces can show a theme-tinted placeholder on the image box before thumbnail pixels fully paint, reducing harsh flashes without changing the page flow.
- **Thumbnail cache state**: newly regenerated JPEG thumbnails only pick up the lower shipped default after two separate conditions are satisfied where relevant: an existing install with an explicit `thumbnails.quality` override must first change or remove that config value, and already-cached thumbnail files must still be cleared before regeneration can produce lower-quality replacements.
- **Post-write thumbnail warm state**: after character-avatar or persona-image writes succeed, EmberDesk can kick off best-effort thumbnail pregeneration in the background so the next normal workspace revisit is less likely to stall on first thumbnail generation; if that background work fails, the existing on-demand thumbnail route still remains the fallback.
- **Post-delete consistency state**: after a character is deleted, stale delayed saves or edit responses for that card should not restore it into the visible library.
- **Temporary chat state**: when the user opens a temporary Assistant chat, the workspace shows a visible temporary-chat status near the current-character title area; it is cleared when a normal character context is selected or a permanent Assistant chat is opened.
- **Post-active-delete safe state**: after deleting the active character, the selected-character title area must route to a safe empty or library state rather than trying to reopen the deleted card.
- **World Info panel state**: the World Info drawer keeps global activation controls separate from the editor selector; empty global selection and editor selection states must not leave stale entry content visible.
- **Shared-library state**: the workspace loads a shared browser library during startup so first-party modules and compatible extensions can use documented imports and legacy globals without each surface bundling its own copy.

## Navigation

- The workspace is the product's main destination and root route.
- From this shell, users can move between the character library, chat context, World Info drawer, background surface, and extension surface without leaving [Chat Workspace](page.chat_workspace).
