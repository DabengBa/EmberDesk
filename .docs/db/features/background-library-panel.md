---
id: feature.background_library_panel
type: feature
name: Background Library Panel (Retired)
related: [page.chat_workspace]
---

# Feature: Background Library Panel (Retired)

## ID 解释

`feature.background_library_panel` preserves the semantic identity of the former global Background Library surface. It describes the retired gallery capability and its boundary, not a currently reachable workspace panel. Active chat backgrounds and avatar media are separate retained capabilities.

## Retirement Contract

The global Background Library is retired. The workspace no longer offers a Backgrounds navigation entry, global gallery, folder browser, background-library filters, bulk actions, upload, rename, delete, lock/unlock, auto-selection, or global sprite/expression persistence. Opening the workspace must not create a replacement panel or silently redirect to the retired surface.

## Retained Neighboring Capabilities

- A user can still use the active background applied to the chat workspace through the existing background setting and chat metadata. A chat-specific background may override the global active background and falls back without changing the chat metadata when that override is removed.
- Static background paths remain available for active chat/background compatibility. This is an active-background concern, not a global library or gallery contract.
- Character avatars, persona images, uploaded images, and their retained thumbnail behavior remain available. Avatar compatibility paths that happen to use `backgrounds/...` are not global Background Library entries.
- Group-chat `hideMutedSprites` metadata remains a chat behavior; it does not restore sprite management or expression persistence.

## Historical Boundary

The former gallery workflow, including global background catalog persistence, folders, thumbnails, expressions, waifu controls, and sprite management, is retired rather than replaced by a hidden legacy owner. Historical implementation and migration records remain in the maintainer docs and project history.

## Semantic Interaction IDs

- `feature.background_library_panel`: the retired global gallery capability and its product boundary.
- `feature.background_library_panel.active_chat_boundary`: the retained active background/chat-metadata boundary, documented here only to distinguish it from the retired gallery.

## Evidence Boundary

The absence of the navigation entry and gallery is the user-visible retirement contract. Active background application, chat metadata round-trip, avatar compatibility, and retained image paths are separate contracts owned by the workspace and media surfaces.

## Boundaries

- Active chat background behavior belongs to [Chat Workspace](page.chat_workspace), not to this retired feature.
- Avatar/persona image behavior belongs to the character and persona surfaces.
- Historical implementation details, route names, and migration mechanics belong in `.docs/tech/` and ADR/history records rather than this semantic feature.
