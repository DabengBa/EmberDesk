---
id: feature.next_workspace_shell
type: feature
name: Next Workspace Shell
related: [page.chat_workspace, feature.startup_bootstrap, feature.character_library_panel, feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, feature.world_info_panel, feature.extension_panel_open]
---

# Feature: Next Workspace Shell

## ID 解释

`feature.next_workspace_shell` represents the same-entry React workspace chrome that owns the visible outer frame of the root [Chat Workspace](page.chat_workspace) without introducing a separate `/workspace-next` route.

## Purpose

Give users one modern, compact workspace frame for current context and primary navigation. React owns shell navigation, active/open/close/refocus state and layout markers; declared child slots retain only their feature-local content and protected compatibility DOM. Drawer pinning is owned by each drawer's legacy lock toggle; the chrome renders no pin control.

## Current Ownership

- The React shell always mounts for `/`; there is no shell product flag, strict-mode switch, inline workspace feature payload, or same-version legacy shell fallback.
- The unified `设置` registry entry routes to React Settings; the `openAIConfig`/`openFormatting`/`openAIConfigDrawer` compatibility commands are retired with the AI Response Configuration drawer. `角色库` (Character Library), `世界书` (World Info), Main Chat, and the `正则` (Regex) drawer use declared child-slot contracts. The former global Background Library entry and the `AI 响应配置` drawer entry are retired; active chat backgrounds remain chat context rather than a shell panel.
- A child slot declares a stable key, mount target, accessible name, content owner, and bounded feature-local capabilities. Legacy drawer classes are not shell state inputs.
- A slot failure is recovered locally without removing shell navigation, chat rows, composer reachability, slash commands, regex support, or shared browser-library providers.
- Release rollback is deployment of a prior application version. A missing React shell bundle is a release-gate failure, not a reason to restore legacy chrome.

## User-Visible Contract

- Opening `/` shows the React-owned workspace chrome instead of competing legacy and React top navigation.
- The chrome summarizes the current context in understandable terms for no active chat, temporary Assistant chat, normal character chat, and character chat.
- Primary entries `角色库`, `世界书`, `正则`, and `设置` are reachable by role/name and use the existing workspace behavior or the shared Settings overlay. The retired Background Library and AI Response Configuration entries have no replacement navigation entries.
- `设置` opens the React [Settings](page.settings) surface as an in-workspace overlay on the last-used tab; `/settings` remains a deep-link full-page mount of the same owner.
- Provider, secret, and formatting fields are edited on the single React Settings 服务 page rather than in workspace drawers; the retired `openAIConfig`/`openFormatting` compatibility commands no longer exist.
- Character Library owns entry into the React character creation and editing surface, so character authoring is not a separate top-level navigation concern.
- The main-chat outer layout can be React shell-owned through existing `#chat`, `#send_form`, and `#nonQRFormItems` containers so the chat canvas, composer/action rail, and local generation status feel coordinated without wrapping or moving message rows.
- Primary entries publish transient React dock state so the shell can show the active entry while the existing facades continue to own panel behavior and local error recovery.
- Clicking the active entry closes that surface when the legacy owner reports that it closed; clicking it again reopens it from the same role/name entry. If the legacy owner reports a pinned or locked drawer, the shell keeps the entry active instead of showing a false inactive state while content remains visible.
- The shell does not show panel-ready, loading, or error badges; the active navigation entry confirms an open panel, while panel-local UI owns error and recovery feedback.
- Maintainer-only cutover terms such as `delete`, `freeze-supported`, `compatibility-facade`, and `blocked` must stay out of the visible shell chrome; they belong to internal docs and diagnostics, not primary navigation copy.
- Local empty/error recovery actions stay scoped to the affected surface instead of blocking the full workspace. Current examples include opening Character Library from an empty main-chat state, retrying or continuing a failed visible generation, importing or refreshing World Info, and opening the Regex drawer. Active background fallback is handled by chat metadata, not a library refresh workflow.
- Drawer pinning is owned by each drawer's own lock toggle, which writes `.pinnedOpen` on the drawer host and persists via accountStorage; the chrome reads that class only to keep an active entry open when its drawer is locked.
- The latest manual panel open and refocus intent is remembered only for the current browser page session. EmberDesk does not add a new persistent workspace preference for that shell state.
- Opening Character Library or World Info from the chrome must succeed on the first click without freezing the visible workspace or requiring a second click to settle panel state. The retired Background Library has no shell entry.
- The chrome must not cover readable chat rows, `#send_textarea`, `#send_but`,  or protected panel mount points.

## Approved Retirement Direction

The shell is a final-wave surface. It may remove its legacy chrome and drawer-coordination runtime only after the React-owned panel and main-chat surfaces no longer depend on it. The completed shell preserves the same `/` entry, named navigation, open/close behavior, accessibility, and first-party feature reachability; release rollback uses a prior version rather than restoring a same-version legacy chrome.

## Semantic Interaction IDs

- `feature.next_workspace_shell`: the overall same-entry React chrome owner state.
- `feature.next_workspace_shell.primary_navigation`: the `角色库`, `世界书`, `正则`, `设置` entry set. The former Backgrounds and AI Response Configuration entries are retired, and the AI Config/Formatting/Settings triple is merged into `设置`.
- `feature.next_workspace_shell.context_summary`: the current character/assistant/no-chat summary.
- `feature.next_workspace_shell.main_chat_layout`: the main-chat layout/status ownership markers on existing chat and composer containers.
- `feature.next_workspace_shell.panel_dock`: the transient active panel state for the registry-backed workspace entries.
- `feature.next_workspace_shell.rollback`: prior-version deployment rollback; no same-version fallback shell exists.

## Acceptance Workflows

- As a workspace user, open `/`; EmberDesk must show one React chrome with current context and primary entries, and failure is old and new top navigation competing for the same job.
- As a user switching from no chat to a character or temporary Assistant chat, continue using the workspace; the chrome summary must update to a clear state without requiring a refresh, and failure is a stale or misleading current-context label.
- As a user opening `角色库`, `世界书`, `正则`, or `设置` from the chrome, use the named entry; EmberDesk must open the established surface or route while preserving protected DOM and panel locations, and failure is a visible button that does nothing or clears legacy panel content. The retired Background Library and AI Response Configuration entries must remain absent rather than exposing dead entries.
- As a user opening, closing, and reopening the same registry-backed entry, click the same named entry repeatedly; EmberDesk must show the surface, hide it when the owner closes, and show it again on the next click, and failure is an entry that cannot reopen after a close.
- As a user switching between registry-backed entries, use the named entries; EmberDesk must mark the active panel locally, keep panel loading/error/fallback state scoped to the panel/dock surface, and preserve pinned or locked drawers instead of closing them as incidental navigation cleanup.
- The AI Response Configuration drawer is retired with the advanced tab and the Advanced Formatting drawer; `oai_settings` values persist without an editing surface, and the overlay is a single providers page.
- As a user retrying from an empty or failed shell-owned surface, use the local recovery action shown on that surface; EmberDesk must recover only the affected panel or main-chat area and must not turn that local problem into a full-workspace blocker.

## Feature-Specific Evidence

- The React chrome root, role/name navigation entries, status attributes, and context text are primary evidence.
- Active navigation state is the primary "action succeeded" signal; this feature does not require an extra success toast or shell status badge for ordinary panel open actions.
- `data-react-workspace-shell-chrome-status` supports diagnostics and automated proof.
- Main-chat layout markers such as `data-main-chat-layout-owner`, `data-main-chat-layout-status`, and `data-main-chat-local-status` support proof that React owns only the outer placement/status shell.
- Panel dock markers such as `data-workspace-shell-panel-entry` and `data-workspace-shell-panel-active` support proof that React owns coordination state without taking over AI configuration, formatting, settings, World Info, Background, or character-row semantics. Character authoring behavior remains owned by its dedicated surface rather than the shell registry itself.
- Internal compatibility snapshots exported through `__emberDeskReactCompatibilityBridge.getSnapshot().workspacePanelDock` support proof that dock status, fallback reason, and transient `locked` / `pinned` facts stay aligned without turning the shell into a second panel-behavior owner.
- Protected DOM checks for `#chat > .mes`, `#send_textarea`, `#send_but`, `#RegexPanel` are compatibility evidence. The Regex surface lives in its own `#RegexPanel` drawer host; the former `#regex_container` Extensions-drawer slot is retired.
- `/workspace-next` must not appear as a route or fallback target for this feature.

## Failure Signals

- Legacy top navigation and React chrome are both visible as primary navigation owners.
- The shell build is absent or invalid at release time.
- React chrome hides or moves message rows, composer controls, or panel mount points.
- Secondary panel loading blocks the entire workspace startup or makes chat unavailable.
- Primary navigation entries are only reachable by brittle selector paths and not by user-visible role/name.
- Clicking a surface closed and then open again leaves the entry visually inactive or unresponsive even though the surface should reopen.

## Boundaries

- Startup readiness and initial overlay behavior belong to [Workspace Startup Bootstrap](feature.startup_bootstrap).
- `角色库`, `世界书`, `设置`, and Character Authoring retain their own feature contracts after the shell opens them. Active chat backgrounds and avatar media remain workspace capabilities; the global Background Library and the AI Response Configuration drawer are retired.
- Message rendering, composer behavior, slash parser, regex engine, and provider transport are not owned by this feature.
- Main-chat shell ownership is limited to outer layout/status placement; row rendering, row actions, slash command execution, and provider transport remain governed by their feature contracts.
