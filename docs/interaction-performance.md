# Interaction Performance

## What Changed

This optimization slice targets the most common character-list interaction lag in EmberDesk.

Delivered behavior:

- opening the character panel can reuse a derived character index instead of reparsing every character PNG on every `/api/characters/all`
- deleting a character no longer triggers a success-path full `getCharacters()` reload
- chat save / rename / delete / import keep character chat aggregates fresh without rebuilding the full indexed row on every save

## Runtime Requirement

The indexed fast path is runtime-gated.

- If the active Node runtime exposes `node:sqlite`, EmberDesk enables the per-user derived character index.
- If `node:sqlite` is unavailable, EmberDesk automatically falls back to the previous filesystem-backed path.

This means the feature is upgrade-safe for older deployments, but the largest steady-state character-list gain appears only when SQLite runtime support is present.

## Where The Index Lives

When enabled, EmberDesk stores derived character-list data here:

- `<user root>/_cache/character-index.sqlite`

The file is rebuildable derived state. Character PNG files and chat files remain the canonical source of truth.

## What Users Should Notice

- character panel open should feel faster on repeat use for larger libraries
- deleting a character should remove the row without waiting for a second full character-list fetch
- chat save responsiveness should not regress just because list aggregates stay accurate

## Validation Checklist

1. Open the character panel twice on the same running server and confirm the second open does not feel like a full cold rescan.
2. Delete a character and confirm the row disappears without a visible full-list refresh.
3. Save, rename, import, or delete a chat for one character, then reopen the character panel and confirm `chat_size` / `date_last_chat` stay accurate.
4. If needed, remove `<user root>/_cache/character-index.sqlite` and reopen the character panel to confirm EmberDesk can rebuild derived state safely.

## Boundaries

This slice does not yet optimize:

- world info list loading
- chat search
- recent chat indexing
- group-chat parity for the same list/index path
