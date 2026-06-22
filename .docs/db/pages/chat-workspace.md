---
id: page.chat_workspace
type: page
name: Chat Workspace
route: /
related: [page.login, page.settings, feature.startup_bootstrap, feature.character_library_panel, feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, feature.character_export, feature.character_delete, feature.world_info_panel, feature.background_library_panel, feature.extension_panel_open, term.character_card, term.shared_browser_library]
---

# Page: Chat Workspace

## ID 解释

`page.chat_workspace` represents EmberDesk's main in-browser working surface after the root URL finishes loading. It covers the persistent shell that users stay in while switching characters, chats, backgrounds, and extensions. It does not cover standalone installation, server startup, or backend-only maintenance tasks.

## Page Purpose

This page exists so a user can run their daily LLM workflow from one browser surface: choose a character, open or continue a chat, and adjust surrounding workspace context without leaving the main shell.

## Page Structure (UI Layout)

1. **Primary shell frame**: the always-present application chrome that becomes usable after the startup overlay disappears.
2. **Character and navigation region**: the area where users browse character cards, search/filter the library, enter bulk edit flows, and switch the active working context.
3. **Main chat region**: the central conversation surface where messages, generation output, and chat actions are shown.
4. **Supporting panels and drawers**: secondary UI surfaces for World Info, extensions, backgrounds, and related workspace tools.
5. **Composer and action region**: the place where users type prompts and trigger chat actions, with the primary textarea, send button, stop/continue/impersonate actions, and chat-options entry discoverable through stable roles and accessible names.

## Page-Level Semantic IDs

- `feature.startup_bootstrap`: the visible shell-loading experience between opening the URL and reaching a usable workspace.
- `feature.character_library_panel`: browsing and selecting character cards from the workspace.
- `feature.chat_message_rendering`: displaying stored or finalized chat messages as readable text inside stable message rows.
- `feature.chat_message_actions`: discovering and using actions attached to rendered chat messages.
- `feature.chat_generation_auto_recovery`: bounded automatic retry behavior for visible main-chat generation failures.
- `feature.character_export`: exporting the active character card as PNG or JSON with keyboard-reachable format selection and visible feedback.
- `feature.character_delete`: removing a character from the active library.
- `feature.world_info_panel`: activating global World Info and editing world-book entries from the workspace drawer.
- `feature.background_library_panel`: opening and refreshing the background library inside the workspace.
- `feature.extension_panel_open`: opening the extensions surface and handling its loading state.
- `term.character_card`: the core object users browse and operate on in the character library.
- `term.shared_browser_library`: the stable browser utility surface used by first-party modules and ES-module extensions.
- `page.settings`: the standalone React settings route; when it is not enabled or its build is unavailable, `/settings` redirects users back to this workspace.

## Included Features

!include feature.startup_bootstrap
!include feature.character_library_panel
!include feature.chat_message_rendering
!include feature.chat_message_actions
!include feature.chat_generation_auto_recovery
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
- **Character-library migration state**: the character library stays in this workspace even while it is being modernized; when the guarded React panel is available the toolbar/list surface can upgrade in place, and when the flag is off or the build is missing the same entry keeps the legacy drawer behavior.
- **Supporting-panel migration state**: World Info, Backgrounds, and Extensions continue to open from the existing workspace drawer entries. When their guarded React panel flags are enabled, EmberDesk can show React host/action surfaces for World Info editor/import/export controls, Background Library filter/gallery/action controls, and Extensions Host notify/manage/install/Extras controls. When a flag is off or the bundle is unavailable, EmberDesk does not add an empty migration host and the legacy panel remains usable. These React surfaces delegate to the existing owners for global activation, prompt activation, regex, world-book deletion, background file operations, slash behavior, extension mount points, wand-menu entries, and extension loading behavior.
- **Main-chat migration state**: the main chat workspace can enable a guarded React message-list island behind `features.react.panels.mainChatMessageList`. In the current completed Phase 3B boundary, the React bundle still mounts inside the existing `#chat` surface, preserves direct-child `.mes[mesid]` rows plus `#show_more_messages` ordering, records per-chat reading-position snapshots, and keeps the same row identity, readable `.mes_text`, swipe wrappers, `.mes_buttons`, and long-chat load-more semantics. Safe stored or finalized non-editing rows may carry a visible React row owner, safe finalized rows may show the React-owned visible message-action shell, `#send_textarea` / `#send_but` now come from the React-owned composer, slash autocomplete and paused/error status UI now come from the React-owned slash surface, and supported visible direct-chat `submitComposer`, `continueLast`, regenerate/retry, and swipe requests can temporarily hand transport/token append ownership to a React mutation. Editing rows, structurally unsafe rows, and excluded non-OpenAI / group / dry-run / nested-visible generation paths fail closed to the legacy owner inside the same chat window. `public/script.js` still owns the formatter chain, code-block/media/file live DOM, compatibility `Generate()` routing, quiet/background generation, excluded compatibility transport paths, slash registry/executor/public exports, and the remaining legacy recovery DOM affordances. Sprint 3 did not bring back a separate `#jump_to_latest_message` control. If the flag is off, the bundle cannot mount, a bridge payload is unsafe, or a row does not satisfy the guarded snapshot path, the chat area stays fully legacy-rendered or falls back to the normal legacy open result.
- **Main-chat reading-position state**: after the user scrolls within a chat or expands older history, leaving that chat and returning in the same browser page session should restore the prior reading region when the guarded React main-chat flag is enabled. If the saved anchor can no longer be reopened safely, EmberDesk falls back to the normal legacy open result instead of leaving the chat in a half-restored state.
- **Character-library oversized state**: if eager character-library loading reaches the configured data length limit, the workspace shows the existing guidance to enable lazy character loading and restart instead of leaving the library failure unexplained.
- **Post-delete consistency state**: after a character is deleted, stale delayed saves or edit responses for that card should not restore it into the visible library.
- **Temporary chat state**: when the user opens a temporary Assistant chat, the workspace shows a visible temporary-chat status near the current-character title area; it is cleared when a normal character context is selected or a permanent Assistant chat is opened.
- **Post-active-delete safe state**: after deleting the active character, the selected-character title area must route to a safe empty or library state rather than trying to reopen the deleted card.
- **World Info panel state**: the World Info drawer keeps global activation controls separate from the editor selector; empty global selection and editor selection states must not leave stale entry content visible.
- **Shared-library state**: the workspace loads a shared browser library during startup so first-party modules and compatible extensions can use documented imports and legacy globals without each surface bundling its own copy.
- **Message rendering state**: stored or finalized messages render into stable `.mes[mesid]` rows with readable `.mes_text`, while message-row actions remain attached to the rendered row.
- **Generation failure recovery state**: when generation fails after a user message or partial assistant output, the workspace keeps the existing rows readable, restores composer input, and exposes a local recovery action instead of requiring a refresh.
- **Automatic recovery state**: visible main-chat generation can retry once on the primary provider and once on the optional fallback provider before the existing manual retry CTA appears.
- **Generation control bridge state**: when the guarded React main-chat flag is enabled, the hidden controller still exposes the current visible generation-control phase for tests and diagnostics. For supported visible direct-chat send/continue/regenerate/retry/swipe requests, the active transport owner can now switch to React during the live request while preserving the same user-visible stop, bounded auto-recovery, and final retry semantics; excluded compatibility requests continue to report through the legacy path.
- **Streaming, composer, and slash bridge state**: when the guarded React main-chat flag is enabled, the hidden controller still exposes streaming transport metadata, composer metadata, and slash-command metadata for tests and diagnostics. The current visible owner split is narrower than the marker set: streaming transport ownership only moves to React for supported direct-chat send/continue/regenerate/retry/swipe requests, the visible composer now owns `#send_textarea` / `#send_but`, and the visible slash surface now owns autocomplete plus paused/aborted/error status UI while keeping full command text and arguments out of the bridge payload.
- **Long-chat load-more state**: after the user loads older messages from a bounded long-chat window, the workspace preserves loaded history and message IDs without adding a separate return-to-newest control.
- **Mobile reachability state**: core composer controls, message actions, long-chat load-more, and generation stop or retry controls should remain visible or keyboard/role reachable on narrow phone and wider mobile/tablet viewports without relying on hover-only discovery.
- **Settings fallback state**: if React [Settings](page.settings) is disabled or its build is missing, opening `/settings` returns the user to this legacy workspace so existing drawers remain the available settings path.

## Navigation

- The workspace is the product's main destination and root route.
- From this shell, users can move between the character library, chat context, World Info drawer, background surface, and extension surface without leaving [Chat Workspace](page.chat_workspace); the migrated character-library panel does not introduce a separate route.
- React [Settings](page.settings) is a separate route for the migrated settings slice; unavailable React settings routes fall back here.
