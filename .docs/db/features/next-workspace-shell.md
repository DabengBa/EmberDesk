---
id: feature.next_workspace_shell
type: feature
name: Next Workspace Shell
related: [page.chat_workspace, feature.startup_bootstrap, feature.character_library_panel, feature.group_authoring, feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, feature.world_info_panel, feature.background_library_panel, feature.extension_panel_open]
---

# Feature: Next Workspace Shell

## ID 解释

`feature.next_workspace_shell` represents the same-entry React workspace chrome that owns the visible outer frame of the root [Chat Workspace](page.chat_workspace) without introducing a separate `/workspace-next` route.

## Purpose

Give users one modern, compact workspace frame for current context, shell status, and primary navigation. React owns shell navigation, active/open/close/refocus/pin state, layout markers, and local status; declared child slots retain only their feature-local content and protected compatibility DOM.

## Current Ownership

- The React shell always mounts for `/`; there is no shell product flag, strict-mode switch, inline workspace feature payload, or same-version legacy shell fallback.
- Registry entries route Settings, AI Config, and Formatting to React Settings. Character Library, World Info, Backgrounds, Extensions, Group Authoring, Character Authoring, and Main Chat use declared child-slot contracts.
- A child slot declares a stable key, mount target, accessible name, content owner, and bounded feature-local capabilities. Legacy drawer classes are not shell state inputs.
- A slot failure is recovered locally without removing shell navigation, chat rows, composer reachability, public extension mounts, slash commands, regex support, or browser compatibility providers.
- Release rollback is deployment of a prior application version. A missing React shell bundle is a release-gate failure, not a reason to restore legacy chrome.

## User-Visible Contract

- Opening `/` shows the React-owned workspace chrome instead of competing legacy and React top navigation.
- The chrome summarizes the current context in understandable terms for no active chat, temporary Assistant chat, normal character chat, and group chat.
- Primary entries for AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring are reachable by role/name and route through the existing workspace behavior or the existing Settings route.
- Settings always opens the standalone React [Settings](page.settings) route.
- AI Config opens `/settings?tab=providers` and Formatting opens `/settings?tab=advanced`; provider, secret, and formatting fields are edited on the Settings page rather than in workspace drawers.
- Group Chats and Character Authoring keep the same right-drawer entry points, but when their guarded authoring flags are enabled the normal visible owner inside those hosts is the React authoring surface. The shell still owns only the navigation entry, active marker, and close/reopen signal.
- The main-chat outer layout can be React shell-owned through existing `#chat`, `#send_form`, and `#nonQRFormItems` containers so the chat canvas, composer/action rail, and local generation status feel coordinated without wrapping or moving message rows.
- Primary entries publish a transient React dock owner state so the shell can show the active entry and local mounted/disabled/loading/empty/success/error status while the existing facades continue to own panel behavior.
- Clicking the active entry closes that surface when the legacy owner reports that it closed; clicking it again reopens it from the same role/name entry. If the legacy owner reports a pinned or locked drawer, the shell keeps the entry active instead of showing a false inactive state while content remains visible.
- Visible shell and panel status badges use short human-readable phrases such as `opening`, `ready`, and `needs attention`; raw internal status enums stay in diagnostics instead of the default path.
- Maintainer-only cutover terms such as `delete`, `freeze-supported`, `compatibility-facade`, and `blocked` must stay out of the visible shell chrome; they belong to internal docs and diagnostics, not primary navigation copy.
- Local empty/error recovery actions stay scoped to the affected surface instead of blocking the full workspace. Current examples include opening Character Library from an empty main-chat state, retrying or continuing a failed visible generation, importing or refreshing World Info, uploading or refreshing Backgrounds, and opening Manage or retrying Extras connection from Extensions.
- React stores pin state for the current page session and projects it to a child slot only after the store transition succeeds.
- The latest manual panel open, refocus, and pinned drawer intent is remembered only for the current browser page session. EmberDesk does not add a new persistent workspace preference for that shell state.
- Opening Character Library, World Info, Backgrounds, or Extensions from the chrome must succeed on the first click without freezing the visible workspace or requiring a second click to settle panel state.
- The chrome must not cover readable chat rows, `#send_textarea`, `#send_but`, or protected extension mount points.

## Approved Retirement Direction

The shell is a final-wave surface. It may remove its legacy chrome and drawer-coordination runtime only after the React-owned panel and main-chat surfaces no longer depend on it. The completed shell preserves the same `/` entry, named navigation, open/close behavior, accessibility, and supported extension reachability; release rollback uses a prior version rather than restoring a same-version legacy chrome.

## Semantic Interaction IDs

- `feature.next_workspace_shell`: the overall same-entry React chrome owner state.
- `feature.next_workspace_shell.primary_navigation`: the AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring entry set.
- `feature.next_workspace_shell.context_summary`: the current character/group/assistant/no-chat summary.
- `feature.next_workspace_shell.recovery_status`: the shell-level loading, empty, success, or error status area.
- `feature.next_workspace_shell.main_chat_layout`: the main-chat layout/status ownership markers on existing chat and composer containers.
- `feature.next_workspace_shell.panel_dock`: the transient active panel and dock status for the registry-backed workspace entries.
- `feature.next_workspace_shell.rollback`: prior-version deployment rollback; no same-version fallback shell exists.

## Acceptance Workflows

- As a workspace user, open `/`; EmberDesk must show one React chrome with current context and primary entries, and failure is old and new top navigation competing for the same job.
- As a user switching from no chat to a character or temporary Assistant chat, continue using the workspace; the chrome summary must update to a clear state without requiring a refresh, and failure is a stale or misleading current-context label.
- As a user opening AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, or Character Authoring from the chrome, use the named entry; EmberDesk must open the established surface or route while preserving protected DOM and extension locations, and failure is a visible button that does nothing or clears legacy panel content.
- As a user opening, closing, and reopening the same registry-backed entry, click the same named entry repeatedly; EmberDesk must show the surface, hide it when the owner closes, and show it again on the next click, and failure is an entry that cannot reopen after a close.
- As a user switching between registry-backed entries, use the named entries; EmberDesk must mark the active panel locally, keep panel loading/error/fallback state scoped to the panel/dock surface, and preserve pinned or locked drawers instead of closing them as incidental navigation cleanup.
- As a user editing legacy-owned AI Config or Formatting fields, switch to another shell panel and back; the entered field values remain in the legacy drawer, and failure is the shell reset, remount, or replacement of those settings while only changing panel focus.
- As a user retrying from an empty or failed shell-owned surface, use the local recovery action shown on that surface; EmberDesk must recover only the affected panel or main-chat area and must not turn that local problem into a full-workspace blocker.

## Feature-Specific Evidence

- The React chrome root, role/name navigation entries, status attributes, and context text are primary evidence.
- Active navigation state plus the local dock/status badge are the primary "action succeeded" signals; this feature does not require an extra success toast for ordinary panel open actions.
- `data-react-workspace-shell-chrome-status` supports diagnostics and automated proof.
- Main-chat layout markers such as `data-main-chat-layout-owner`, `data-main-chat-layout-status`, and `data-main-chat-local-status` support proof that React owns only the outer placement/status shell.
- Panel dock markers such as `data-workspace-shell-panel-entry`, `data-workspace-shell-panel-active`, and `data-workspace-panel-dock-status` support proof that React owns coordination state without taking over AI configuration, formatting, settings, World Info, Background, Extension, or character-row semantics. Character and group authoring behavior remains owned by the dedicated authoring surfaces rather than the shell registry itself.
- Internal compatibility snapshots exported through `__emberDeskReactCompatibilityBridge.getSnapshot().workspacePanelDock` support proof that dock status, fallback reason, and transient `locked` / `pinned` facts stay aligned without turning the shell into a second panel-behavior owner.
- Protected DOM checks for `#chat > .mes`, `#send_textarea`, `#send_but`, `#extensions_settings`, `#extensions_settings2`, and `#regex_container` are compatibility evidence.
- `/workspace-next` must not appear as a route or fallback target for this feature.

## Failure Signals

- Legacy top navigation and React chrome are both visible as primary navigation owners.
- The shell build is absent or invalid at release time.
- React chrome hides or moves message rows, composer controls, or extension mount points.
- Secondary panel loading blocks the entire workspace startup or makes chat unavailable.
- Visible shell or panel badges expose raw internal enums such as `loading` or `success` instead of short user-facing phrases.
- Primary navigation entries are only reachable by brittle selector paths and not by user-visible role/name.
- Clicking a surface closed and then open again leaves the entry visually inactive or unresponsive even though the surface should reopen.

## Boundaries

- Startup readiness and initial overlay behavior belong to [Workspace Startup Bootstrap](feature.startup_bootstrap).
- AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring retain their own feature contracts after the shell opens them.
- Message rendering, composer behavior, slash parser, regex engine, provider transport, and extension protocols are not owned by this feature.
- Main-chat shell ownership is limited to outer layout/status placement; row rendering, row actions, slash command execution, and provider transport remain governed by their feature contracts.
