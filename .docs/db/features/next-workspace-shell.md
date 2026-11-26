---
id: feature.next_workspace_shell
type: feature
name: Next Workspace Shell
related: [page.chat_workspace, feature.startup_bootstrap, feature.character_library_panel, feature.prompt_panel, feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, feature.world_info_panel]
---

# Feature: Next Workspace Shell

## ID 解释

`feature.next_workspace_shell` represents the one-entry workspace frame of the root [Chat Workspace](page.chat_workspace). It owns the visible outer frame, navigation entries, and open/active/close/refocus state. It does not add a separate destination or own the behavior of the surfaces it opens.

## Purpose

Give users one modern, compact workspace frame that summarizes the current context and reaches the primary authoring and settings surfaces without replacing or duplicating them.

## User-Visible Contract

- Opening the app root shows one workspace frame for the current chat context. No competing older frame, second destination, or preview-only shell appears.
- The frame summarizes the current context in understandable terms for no active chat, a temporary Assistant chat, and character chats. The summary updates as the user switches chats without a refresh.
- The primary entries are `提示词`, `角色库`, `世界书`, `正则`, and `设置`. Each is reachable by its visible name. The central surfaces (`世界书`, `正则`, and `设置`) share the same top-center drawer appearance: a title row over a content body, with no pin or close controls. The former separate message-rendering drawer is retired; its frontend-card fields are part of the Providers page in [Settings](page.settings).
- `设置` opens the Settings surface on the last-used tab. The Settings drawer refuses to close while the surface reports unsaved changes. Provider, secret, and formatting fields are edited only in [Settings](page.settings), not in workspace drawers.
- Character authoring starts from Character Library; it is not a separate top-level destination.
- The outer chat canvas, composer/action rail, and local generation status feel coordinated as part of the frame without wrapping or moving message rows.
- The active navigation entry confirms an open surface. The frame does not show panel-ready, loading, or error badges; each surface owns its own error and recovery feedback.
- Clicking the active entry closes the surface when that surface reports it closed; clicking it again reopens it from the same entry. If a drawer reports itself locked, the entry stays active while its content remains visible.
- Maintainer-only cutover labels never appear in navigation copy.
- Local empty/error recovery stays in the affected surface: examples include opening Character Library from an empty chat, retrying or continuing a failed visible generation, importing or refreshing World Info, and opening the Regex drawer. A secondary loading failure never blocks the whole workspace or chat.
- Some side panels start open and locked on a wide desktop's first run, and closed and unlocked on narrow or mobile contexts. An explicit stored false is never overridden by that default. No lock control is rendered in the frame.
- The most recent manual panel open or refocus intent is remembered only for the current browser page session; no new persistent workspace preference is introduced.
- Opening Character Library or World Info from the frame works on the first click without freezing the workspace or requiring a second click.
- The frame never covers readable chat rows, the message composer, its send control, or protected panel locations.

## Semantic Interaction IDs

- `feature.next_workspace_shell`: the overall same-entry frame and chrome state.
- `feature.next_workspace_shell.primary_navigation`: the `提示词`, `角色库`, `世界书`, `正则`, `设置` entry set.
- `feature.next_workspace_shell.context_summary`: the current character/assistant/no-chat summary.
- `feature.next_workspace_shell.main_chat_layout`: the main-chat layout/status ownership markers on existing chat and composer containers.
- `feature.next_workspace_shell.panel_dock`: the transient active panel state for the registry-backed workspace entries.
- `feature.next_workspace_shell.rollback`: prior-version deployment rollback; no same-version fallback shell exists.

## Acceptance Workflows

- As a workspace user, open the app root; EmberDesk must show one frame with the current context and primary entries. Failure is two competing primary navigation owners or a separate preview destination.
- As a user switching from no chat to a character or temporary Assistant chat, keep using the workspace; the context summary must update without a refresh. Failure is a stale or misleading label.
- As a user opening `提示词`, `角色库`, `世界书`, `正则`, or `设置`, use the named entry; EmberDesk must open the established surface while preserving chat rows, composer controls, and panel locations. Failure is a button that does nothing or clears a panel's content.
- As a user opening, closing, and reopening the same entry, click the same named entry repeatedly; EmberDesk must show the surface, hide it when its owner closes it, and show it again on the next click. Failure is an entry that stays inactive or unresponsive after a close.
- As a user switching between entries, the frame marks the active panel locally and keeps loading, error, and fallback feedback scoped to that surface. Locked drawers stay open rather than being closed as incidental navigation cleanup.
- As a user with unsaved Settings changes, try to leave the drawer; EmberDesk must refuse the close. Failure is silently losing edits.
- As a wide-desktop first-time user, find the prompts and character drawers initially open and locked; on a narrow or mobile first run they start closed and unlocked. An explicit stored false remains false. Failure is a lock control in the frame or an overridden stored choice.
- As a user retrying from an empty or failed surface, use the local recovery action; EmberDesk must recover only that surface or the main chat, never blocking the full workspace.

## Failure Signals

- Two navigation frames are visible as primary owners.
- A secondary panel's loading blocks the entire workspace or makes chat unavailable.
- Navigation entries are reachable only through brittle internal paths rather than visible names.
- Clicking a closed entry leaves it inactive or unresponsive when it should reopen.
- The frame hides or moves message rows, composer controls, or panel mount locations.
- A lock state shown by the frame contradicts the actual drawer, or a stored explicit false is overridden by the first-run default.
- Maintainer cutover labels appear in primary navigation copy.

## Boundaries

- Startup readiness and initial overlay behavior belong to [Workspace Startup Bootstrap](feature.startup_bootstrap).
- `角色库`, `世界书`, and `设置` retain their own contracts after the frame opens them.
- Message rows and actions, composer behavior, regex processing, and provider transport belong to their own features: [Chat Message Rendering](feature.chat_message_rendering), [Chat Message Actions](feature.chat_message_actions), [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery), and [World Info](feature.world_info_panel).
- Prompt authoring belongs to [Prompt Panel](feature.prompt_panel); character authoring belongs to [Character Library](feature.character_library_panel).
