---
id: page.chat_workspace
type: page
name: Chat Workspace
route: /
related: [page.login, page.settings, feature.startup_bootstrap, feature.next_workspace_shell, feature.character_library_panel, feature.group_authoring, feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, feature.character_export, feature.character_delete, feature.world_info_panel, feature.background_library_panel, feature.extension_panel_open, term.character_card, term.shared_browser_library]
---

# Page: Chat Workspace

## ID 解释

`page.chat_workspace` represents EmberDesk's main in-browser working surface after the root URL finishes loading. It covers the persistent shell that users stay in while switching characters, chats, backgrounds, and extensions. It does not cover standalone installation, server startup, or backend-only maintenance tasks.

## Page Purpose

- Workspace-facing events, slash, and extension reachability remain under the provider-neutral compatibility contract baseline used by React legacy-retirement packages.

This page exists so a user can run their daily LLM workflow from one browser surface: choose a character, open or continue a chat, and adjust surrounding workspace context without leaving the main shell.

## Page Structure (UI Layout)

1. **Primary shell frame**: the always-present application chrome that becomes usable after the startup overlay disappears.
2. **Character and navigation region**: the area where users browse character cards, search/filter the library, enter bulk edit flows, and switch the active working context.
3. **Main chat region**: the central conversation surface where messages, generation output, and chat actions are shown.
4. **Supporting panels and drawers**: secondary UI surfaces for World Info, extensions, backgrounds, and related workspace tools.
5. **Composer and action region**: the place where users type prompts and trigger chat actions, with the primary textarea, send button, stop/continue/impersonate actions, and chat-options entry discoverable through stable roles and accessible names.

## Page-Level Semantic IDs

- `feature.startup_bootstrap`: the visible shell-loading experience between opening the URL and reaching a usable workspace.
- `feature.next_workspace_shell`: the same-entry React workspace chrome that can own current context, shell status, and primary workspace navigation.
- `feature.character_library_panel`: browsing and selecting character cards from the workspace.
- `feature.group_authoring`: creating and editing group definitions, members, and save state from the workspace drawer.
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
- `page.settings`: the standalone React settings route and sole product owner for general, provider, UI, and advanced settings; shell Settings / AI Config / Formatting navigate there.

## Included Features

!include feature.startup_bootstrap
!include feature.next_workspace_shell
!include feature.character_library_panel
!include feature.group_authoring
!include feature.chat_message_rendering
!include feature.chat_message_actions
!include feature.chat_generation_auto_recovery
!include feature.character_export
!include feature.character_delete
!include feature.world_info_panel
!include feature.background_library_panel
!include feature.extension_panel_open

## Page States And Constraints

- **Settings navigation state**: the React workspace shell Settings entry navigates to `/settings`. AI Config navigates to `/settings?tab=providers`. Formatting navigates to `/settings?tab=advanced`. These entries no longer open legacy settings drawers as product fallbacks.


- **Startup state**: the shell is not yet interactive while the startup overlay is still visible.
- **Ready state**: the main shell becomes usable before every supporting panel has necessarily finished background loading.
- **Degraded state**: if a supporting surface such as extensions or backgrounds fails to load, the core shell can still remain usable and the affected panel shows local retry or follow-up refresh behavior.
- **Thumbnail paint state**: avatar-heavy list surfaces can show a theme-tinted placeholder on the image box before thumbnail pixels fully paint, reducing harsh flashes without changing the page flow. Static image templates use explicit default placeholder assets (`img/No-Image-Placeholder.svg` or the user-avatar default) so an uninitialized dynamic image does not begin as an empty or broken `src`.
- **Thumbnail cache state**: newly regenerated JPEG thumbnails only pick up the lower shipped default after two separate conditions are satisfied where relevant: an existing install with an explicit `thumbnails.quality` override must first change or remove that config value, and already-cached thumbnail files must still be cleared before regeneration can produce lower-quality replacements.
- **Post-write thumbnail warm state**: after character-avatar or persona-image writes succeed, EmberDesk can kick off best-effort thumbnail pregeneration in the background so the next normal workspace revisit is less likely to stall on first thumbnail generation; if that background work fails, the existing on-demand thumbnail route still remains the fallback.
- **Managed media compatibility state**: persona avatars, uploaded images, and chat attachments keep their established workspace paths and thumbnail behavior. When their managed catalog is enabled and verified, EmberDesk can retain their identity and lifecycle through that catalog without changing the URLs used by the workspace; when it is disabled or requires repair, the compatible file paths remain available through the existing file-backed path. Managed attachment paths that no longer resolve through that catalog now fail before a canonical chat save is committed instead of creating a new hidden dangling reference.
- **Chat persistence compatibility state**: after the chat storage migration is verified, character and group chats still open, export, save, rename, delete, and import through the same workspace controls. The browser receives the complete history used by load-more, with the same message order, swipes, metadata, events, renderer ownership, slash commands, and row actions; the migration adds no server pagination. Character and group chat search/recent now read canonical session/query state after a clean chat audit while preserving the same response shape, pinned ordering, metadata, and root-chat recent fallback. If projection repair or validated restore is needed, the visible chat result remains coherent and operators complete recovery without exposing storage controls or governance notices in the workspace. Out-of-band file edits do not silently replace the chat a user has saved through the workspace.
- **Character-library owner state**: the character library stays on the same workspace entry, and the React panel is the sole runtime owner for the visible toolbar, list, selection, and bulk-browsing surface. There is no Character Library product flag or legacy list fallback; release validation must ship the React bundle, and a missing bundle fails closed with a visible build error. Operational rollback is deployment of the previous application version.
- **Supporting-panel migration state**: World Info, Backgrounds, and Extensions continue to open from the existing workspace drawer entries. World Info, Background Library, and Extensions Host are React sole-owner surfaces on those same entries: visible workbench, gallery, and Extensions Host controls belong to React, while framework-neutral services behind `public/scripts/world-info.js`, `public/scripts/backgrounds.js`, and `public/scripts/extensions.js` own selection, persistence, extension lifecycle/operations, and slash-compatible outcomes. Hidden legacy DOM and protected extension mount slots may remain as non-visible or freeze-supported compatibility scaffolding, not as product dual-owner hosts. Missing workspace-panels builds fail closed with a visible build error rather than restoring flag-off legacy panel owners. For Background Library, React gallery actions and `/lockbg` / `/unlockbg` / `/autobg` share the background library service through the `backgrounds.js` barrel. For Extensions Host, React owns notify/Manage/Install/Extras and mount lifecycle; the `extensions.js` barrel stays a thin public API for documented imports, events, and operation helpers while `#extensions_settings`, `#extensions_settings2`, `#regex_container`, and wand-menu nodes remain stable compatibility slots.
- **Workspace panel dock coordination state**: When the same-entry React chrome is mounted, Character Library, World Info, Backgrounds, Extensions, Group Chats, and Character Authoring entries publish a transient active-panel/dock state. The chrome can mark the active entry and show local mounted, disabled, loading, empty, success, or error status without adding persistent storage. Clicking the active entry closes the established surface when the legacy owner reports that it closed; clicking it again reopens the surface from the same entry. Group Chats use this close/reopen behavior while their lists remain legacy-owned inside the existing drawers. Settings, AI Config, and Formatting are route transitions to [Settings](page.settings) rather than drawer panels. Visible shell and panel badges use short human-readable phrases such as `opening`, `ready`, and `needs attention`, while raw enums remain inside collapsed diagnostics. The latest manual open, refocus, and pinned-drawer intent is remembered only in the current browser page session, so a refresh or remount in that same session does not immediately discard the user's last panel choice while still avoiding a new long-term preference. The same transient path also carries drawer `pinnedOpen` facts as `locked` / `pinned` metadata for compatibility snapshots and focused proof, but the visible shell chrome does not render separate pinned/locked badges. Flag-off, missing-container, bundle-load-failed, or mount-failed paths for remaining panel surfaces still open the established fallback surface from the same workspace entry and must not create an empty migration host.
- **Main-chat migration state**: the guarded React message-list island remains inside the existing `#chat` surface, preserving direct-child `.mes[mesid]` rows, `#show_more_messages` ordering, reading-position snapshots, swipe wrappers, `.mes_buttons`, and long-chat load-more behavior. The React shell owns visible composer and action entry points; each sends the same generation command that is used by public and automation adapters. One framework-neutral generation service owns request assembly, streaming lifecycle, stop, bounded recovery, fallback attempts, and final results for visible direct, group, provider-specific, dry-run, nested, quiet, and background requests. The compatibility `Generate()` entry continues to accept existing callers but delegates to that service. Quiet and background helpers remain non-visible, create no assistant row, return generated text, and do not auto-retry. The renderer/windowing boundary is separate: active streams continue through stable `.mes` and `.mes_text` behavior, while only safe finalized rows may use the independently guarded React renderer path. The hidden controller retains layout, local-status, windowing, and row-lifecycle diagnostics; it no longer publishes visible or quiet transport-owner markers. Sprint 3 did not bring back a separate `#jump_to_latest_message` control.
- **Main-chat reading-position state**: after the user scrolls within a chat or expands older history, leaving that chat and returning in the same browser page session should restore the prior reading region when the guarded React main-chat flag is enabled. If the saved anchor can no longer be reopened safely, EmberDesk falls back to the normal legacy open result instead of leaving the chat in a half-restored state.
- **Character-library oversized state**: if eager character-library loading reaches the configured data length limit, the workspace shows the existing guidance to enable lazy character loading and restart instead of leaving the library failure unexplained.
- **Character data transparency state**: the workspace keeps the same visible character-library and current-card behavior instead of exposing hidden cache/index maintenance steps to the user; the retired character-index sidecar is not part of the user workflow.
- **Post-delete consistency state**: after a character is deleted, stale delayed saves, edit responses, or late character-library query snapshots for that card should not restore it into the visible library.
- **Temporary chat state**: when the user opens a temporary Assistant chat, the workspace shows a visible temporary-chat status near the current-character title area; it is cleared when a normal character context is selected or a permanent Assistant chat is opened.
- **Post-active-delete safe state**: after deleting the active character, the selected-character title area must route to a safe empty or library state rather than trying to reopen the deleted card.
- **World Info panel state**: the World Info drawer keeps global activation controls separate from the editor selector; empty global selection and editor selection states must not leave stale entry content visible. When the guarded React World Info panel is mounted, React is the sole visible workbench owner inside the same drawer entry (no independent route); legacy DOM remains the hidden adapter and flag-off/build-failure fallback. Locked Character Management still coexists while World Info is open.
- **Retired vector state**: the workspace no longer exposes built-in Vector Storage, vector prompt itemization, or a Vectorized World Info state. Data Bank attachment management remains available, legacy vector indexes remain untouched derived data, and stale `/api/vector/*` callers receive a JSON `410 Gone` response.
- **Workspace shell successor state**: EmberDesk has reopened the shell owner boundary as a same-entry takeover path for `/`, not as a separate `/workspace-next` route. When `features.react.shell.takeover` is enabled and the React bundle mounts, the visible top workspace chrome can be React-owned while the established chat, composer, drawer content, and protected extension mount points remain in place. When the flag is off, the bundle is missing, or mount fails, the legacy chrome remains the rollback owner and diagnostics record the reason.
- **Cutover-governance visibility state**: maintainer verdicts about whether a retained legacy surface is frozen, blocked, or a compatibility facade stay in tech docs and ADRs. The default workspace must not expose those governance labels as user-facing badges, menu text, or explanatory banners.
- **Same-entry shell takeover state**: The takeover path publishes hidden diagnostics and a visible React chrome host in the current workspace. In explicit development, test, and CI environments, an enabled takeover should fail fast when required host, payload, bundle, or mount conditions are missing instead of silently passing through legacy fallback; an unspecified `NODE_ENV` keeps the production safety fallback behavior. In production safety paths or explicit rollback states, the existing workspace shell can remain visible so users are not stranded by a blank or broken page, while diagnostics record the failure reason.
- **React chrome navigation state**: When the React workspace chrome is mounted, AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring are the visible primary navigation entries. AI Config opens `/settings?tab=providers` and Formatting opens `/settings?tab=advanced`. Settings always opens the React [Settings](page.settings) route. Group Chats and Character Authoring keep their same right-drawer entry points, and React is the sole owner for group and character create/edit fields and direct save commands. Missing workspace-panels builds fail closed; previous-version deploy is the rollback path.
- **React panel entry accessibility state**: Registry-backed entries remain role/name reachable and expose active pressed state while the active panel status remains a local shell/panel signal rather than global workspace loading.
- **First-open panel state**: Opening World Info, Character Library, Backgrounds, or Extensions from the React chrome should succeed on the first click without freezing the visible workspace; the action should settle locally to the chosen panel instead of stalling the whole shell.
- **Global compatibility export state**: `globalThis.SillyTavern`, `eventSource` / `event_types`, and `@sillytavern/*` remain supported extension contracts. Current legacy providers are staged implementation facts; React retirement must preserve their behavior through deliberate replacements. `/lib.js` stays the preferred shared browser utility surface, and `__emberDeskReactCompatibilityBridge` stays internal-only.
- **Shared-library state**: the workspace loads a shared browser library during startup so first-party modules and compatible extensions can use documented imports and legacy globals without each surface bundling its own copy.
- **Message rendering state**: stored or finalized messages render into stable `.mes[mesid]` rows with readable `.mes_text`, while message-row actions remain attached to the rendered row.
- **Generation failure recovery state**: when generation fails after a user message or partial assistant output, the workspace keeps the existing rows readable, restores composer input, and exposes a local recovery action instead of requiring a refresh.
- **Automatic recovery state**: visible main-chat generation can retry once on the primary provider and once on the optional fallback provider before the existing manual retry CTA appears.
- **Generation control bridge state**: when the guarded React main-chat flag is enabled, the hidden controller exposes the current generation and streaming phases for tests and diagnostics. Those phases describe the unified command/lifecycle service rather than a React-versus-legacy transport handoff.
- **Streaming, composer, slash, and quiet-helper bridge state**: the visible composer owns `#send_textarea` / `#send_but`, and the visible slash surface owns autocomplete plus paused/aborted/error status UI while keeping command text and arguments out of the bridge payload. Streaming, composer, and slash diagnostics remain available for tests; quiet/background requests retain their non-visible, no-row, return-string behavior without separate owner markers.
- **Long-chat load-more state**: after the user loads older messages from a bounded long-chat window, the workspace preserves loaded history and message IDs without adding a separate return-to-newest control.
- **Mobile reachability state**: core composer controls, message actions, long-chat load-more, and generation stop or retry controls should remain visible or keyboard/role reachable on narrow phone and wider mobile/tablet viewports without relying on hover-only discovery.
- **Mobile panel dock state**: On narrow viewports, React panel dock status avoids consuming chrome width or covering the composer; drawer content and protected extension/message surfaces remain reachable through the existing mobile layout rules.
- **Mobile shell status state**: On narrow viewports, the shell hides the status strip instead of compressing it into a competing badge so composer width and drawer reachability stay prioritized.
- **Settings missing-build state**: if the React app build for [Settings](page.settings) is missing, `/settings` fails closed with HTTP 503 rebuild instructions instead of returning users to workspace legacy settings drawers.

## Approved React Retirement Direction

The workspace keeps its established route and extension-visible contracts while individual React surfaces retire legacy UI ownership. Main-chat command execution is now unified behind the framework-neutral generation service; renderer and windowing retirement remain separately scoped. Rollback is deployment of a prior version rather than a live transport fallback.

## Navigation

- The workspace is the product's main destination and root route.
- From this shell, users can move between the character library, chat context, World Info drawer, background surface, and extension surface without leaving [Chat Workspace](page.chat_workspace); the migrated character-library panel does not introduce a separate route.
- React [Settings](page.settings) is the sole product owner for general, provider, UI, and advanced settings; shell and legacy direct top-bar Settings / AI Config / API Connections / Formatting entries navigate there instead of opening their old forms. Specialized World Info, Extensions, and Persona surfaces remain on this workspace.
