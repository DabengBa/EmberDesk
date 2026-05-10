# Interaction Performance

## What Changed

This optimization slice targets the most common character-list interaction lag in EmberDesk.

Delivered behavior:

- opening the character panel can reuse a derived character index instead of reparsing every character PNG on every `/api/characters/all`
- deleting a character no longer triggers a success-path full `getCharacters()` reload
- deleting a character no longer pays the old pre-request `closeCurrentChat()` transition that synchronously hydrated recent chats before the delete request could start
- chat save / rename / delete / import keep character chat aggregates fresh without rebuilding the full indexed row on every save
- a dedicated browser-driven A/B benchmark now exists to measure the current SQLite index benefit against the filesystem fallback on the same Node runtime

## Runtime Requirement

The indexed fast path is runtime-gated.

- If the active Node runtime exposes `node:sqlite`, EmberDesk enables the per-user derived character index.
- If `node:sqlite` is unavailable, EmberDesk automatically falls back to the previous filesystem-backed path.

This means the feature is upgrade-safe for older deployments, but the largest steady-state character-list gain appears only when SQLite runtime support is present.

The benchmark tooling uses an internal measurement override instead of changing runtimes:

- `EMBERDESK_CHARACTER_INDEX_MODE=auto|force_on|force_off`
- `EMBERDESK_INTERACTION_PERF_MODE=1`

These switches are for local measurement and regression review, not for end users.

## Where The Index Lives

When enabled, EmberDesk stores derived character-list data here:

- `<user root>/_cache/character-index.sqlite`

The file is rebuildable derived state. Character PNG files and chat files remain the canonical source of truth.

## What Users Should Notice

- character panel open should feel faster on repeat use for larger libraries
- deleting a character should remove the row without waiting for a second full character-list fetch
- deleting a character should no longer pause on the old pre-delete welcome-screen/recent-chat hydration path before the request starts
- chat save responsiveness should not regress just because list aggregates stay accurate

Current boundary:

- this slice does not yet optimize all post-delete UI work
- on large profiles, the remaining tail can still come from later refresh work after the delete request succeeds

## How To Measure It

Use the built-in interaction runner:

```bash
npm run perf:interaction -- --profile medium --scenario suite
```

Useful focused runs:

```bash
npm run perf:interaction -- --profile large --scenario characters_all_warm_repeat
npm run perf:interaction -- --profile large --scenario characters_get_warm_repeat
```

The runner:

- seeds a deterministic local dataset
- runs SQLite `force_on` and `force_off` on the same machine and same Node runtime
- uses a real headless browser context and same-origin requests
- validates which route path actually answered each sample through response headers
- writes artifacts under `artifacts/interaction-perf/<timestamp>/`

Expected artifacts:

- `report.json`
- `report.md`
- `samples.json`
- `config.json`
- per-scenario screenshots

## Validation Checklist

1. Open the character panel twice on the same running server and confirm the second open does not feel like a full cold rescan.
2. Delete a character and confirm the row disappears without a visible full-list refresh.
3. Save, rename, import, or delete a chat for one character, then reopen the character panel and confirm `chat_size` / `date_last_chat` stay accurate.
4. If needed, remove `<user root>/_cache/character-index.sqlite` and reopen the character panel to confirm EmberDesk can rebuild derived state safely.
5. Run `npm run perf:interaction -- --profile small --scenario suite` and confirm the report shows:
   - `characters_all:first_build` separately from warm steady-state scenarios
   - `characters_all:indexed` for SQLite-on list runs
   - `characters_all:filesystem` for SQLite-off list runs
   - `characters_get:indexed` for SQLite-on warm `/get` runs

## Boundaries

This slice does not yet optimize:

- world info list loading
- chat search
- recent chat indexing
- the remaining post-delete `CHAT_CHANGED` / welcome-screen tail after the delete request has already succeeded
- group-chat parity for the same list/index path
- remote VPS + WAN latency; the current benchmark is intentionally local and controlled so SQLite on/off remains comparable
