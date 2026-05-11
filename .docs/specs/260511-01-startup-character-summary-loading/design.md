# Startup Character Summary Loading

## Intent & Core Flow

Intent: cut startup `getCharacters` latency by making character bootstrap summary-first, so EmberDesk no longer waits for the full-library payload before the workspace becomes usable.

Primary actor: a browser user opening or reloading EmberDesk's root workspace.

Happy path:

1. The user opens the root URL and sees the existing startup overlay.
2. Startup fetches a lightweight character list payload instead of the legacy full-library payload.
3. EmberDesk rebuilds `characters[]` from summary rows, restores the previously active avatar if one exists, loads groups, and renders the list.
4. If startup needs one active character's deep data, EmberDesk fetches that single full payload through the existing `/api/characters/get` path before chat-specific logic uses full-only fields.
5. The startup overlay disappears as soon as the workspace shell, summary character list, groups, and active chat context are usable.
6. Full payloads continue to load only when the user selects a card, opens an editor surface, starts a chat flow that requires deep fields, or triggers another explicitly full-only workflow.

## Scope / Out of Scope

In scope now:

- add a dedicated summary list route for startup and normal list refreshes
- make the existing shallow-first behavior the default startup path instead of a config-gated optimization
- expand the summary payload just enough to preserve current client-side character search behavior without a second startup search dataset
- keep per-character full payload loading on `/api/characters/get`
- keep using the existing `shallow` / `unshallowCharacter()` upgrade primitive
- audit and patch deep-data consumers so they explicitly unshallow before reading `json_data`, `data.character_book`, or other full-only fields
- reuse the existing SQLite sidecar row model with only:
  - `full_json`
  - `shallow_json`
- document and test the one-time derived-index rebuild behavior for existing users

Out of scope now:

- adding a third persistent payload class such as `search_json`
- adding a dedicated `/api/characters/search-data` route
- adding a startup search warmup phase or “search warming up” UI state
- introducing a new client-side search cache keyed separately from `characters[]`
- replacing the jQuery frontend with a new framework
- removing file-backed canonical character storage
- deleting `/api/characters/all` or `/getcharacters` legacy compatibility routes
- server-side fuzzy ranking, SQLite FTS, or a new remote search service
- virtualizing or chunking the character list DOM render
- redesigning unrelated startup stages such as locales, settings, backgrounds, or extension initialization

First shippable slice:

- startup stops waiting on the full-library payload
- the character list boots from summary rows only
- the summary rows carry enough text to preserve current client-side search behavior
- full character data is loaded on demand through the existing `/api/characters/get`

## Edge Rules / Acceptance

Acceptance outcomes:

- Startup must no longer download the full `/api/characters/all` payload before the workspace becomes usable.
- The startup overlay must disappear after summary-list readiness, group readiness, and active-character readiness if one character is already selected.
- When no character is active at reload time, startup must fetch zero full character payloads before the overlay disappears.
- When one character is active at reload time, startup may fetch that one full payload before chat-specific UI continues; it must not preload the rest of the library.
- The visible character list order, summary metadata, card selection behavior, and client-side search results must stay functionally equivalent to today.
- Existing users must not lose character, chat, or world data during upgrade; only derived SQLite rows may rebuild.
- The first request after upgrade may pay a one-time derived-index rebuild cost, but the route must stay functionally correct without manual migration steps.
- `/api/characters/get` remains file-authoritative and keeps the existing stale-row fallback rules.
- Character editor flows, extension-field writers, world-info consumers, and other deep-data readers must auto-unshallow before reading full-only fields.
- Triggering character search after startup must still work immediately from the in-memory `characters[]` list; it must not depend on a second deferred route, a warmup task, or a full-character fetch.
- `/api/characters/all` must remain available for legacy/internal compatibility during this slice.

State coverage:

- `loading`
  - startup overlay waits for summary list readiness, not full-library readiness
- `empty`
  - zero-character libraries still render correctly from the summary route
- `success`
  - list browsing and character search work from summary rows
  - selecting or reopening a card upgrades only the needed row to full payload
- `error`
  - summary-list request failure keeps the current startup failure behavior
  - per-character full fetch failure keeps the current per-character error behavior

Recovery boundaries:

- Corrupt or stale derived SQLite rows must self-heal through the existing rebuild path.
- Non-SQLite runtimes still need a functional filesystem-backed path for the summary list route, even if SQLite remains the primary production path.
- If a summary row exists but the later full fetch fails for the active character, EmberDesk must preserve the current per-character recovery behavior rather than treating the whole startup as irrecoverable.

## Architecture / Constraints

Fit with current repo patterns:

- canonical character data stays file-backed in `data/<user>/characters/*.png`
- SQLite remains derived state only in `<user root>/_cache/character-index.sqlite`
- the client keeps using the existing `character.shallow` flag and `unshallowCharacter()` upgrade path
- the design aligns with `feature.startup_bootstrap`: the workspace becomes usable before every secondary surface has finished loading
- this slice is framed as promoting and expanding the existing shallow path, not inventing a parallel startup model

Core design choice:

Use two payload classes only:

1. `summary payload`
   - purpose: startup list rendering, ordinary list refreshes, and immediate client-side character search
   - source: the current `toShallow()` contract, expanded to include the search text fields the client already queries
   - stored in the existing `shallow_json`
2. `full payload`
   - purpose: active character, character editor, extension mutation helpers, world-info consumers, and other deep-data features
   - source: existing `/api/characters/get` full object, including `json_data`
   - stored in the existing `full_json`

Why this is the chosen design:

- production startup evidence shows the bottleneck is payload shape, not SQLite lookup speed
- the measured production response decoded to about `19.48 MB`, which matches the stored `full_json` total in the SQLite sidecar
- production inspection showed the dominant bytes are `json_data` and large nested `data.*` fields such as `character_book`
- the review concern about three-payload over-design is valid: a dedicated `search_json` plus route, cache, warmup flow, and UI state would add broad new surface area for a gain that is not yet proven necessary
- a richer summary row still removes the heaviest fields while preserving current client-side search behavior with fewer moving parts

Measured production field-size constraints supporting this choice:

- across 86 production characters:
  - `description` total `365,365` bytes, average about `4.2 KB`, `p90` about `11.8 KB`
  - `first_mes` total `322,927` bytes, average about `3.8 KB`, `p90` about `7.1 KB`
  - `alternate_greetings` total `994,055` bytes, but highly skewed: median `2` bytes, `p90` about `40.2 KB`
- these fields are materially smaller than the removed `json_data`, `character_book`, and large extension payloads, but not small enough to justify “tens of KB” expectations for the whole list
- the design therefore targets a practical startup reduction, not an artificially tiny payload target

Hard constraints:

- startup must not depend on `performance.lazyLoadCharacters` to get the new behavior; summary-first startup becomes the default path
- the startup route contract must be explicit; do not overload `/api/characters/all` with hidden request flags for this slice
- the new summary payload must be compatible with `fuzzySearchCharacters()` so search keeps working from `characters[]`
- any internal caller that only needs list/search data should use the summary row; only deep readers should force a full fetch
- the implementation must preserve the existing behavior where group hydration can map member names to avatars from the list payload
- the implementation must systematically audit deep consumers rather than rely on a few hand-picked call sites
- the design goal is not “tiny payload at any cost”; it is to remove the confirmed multi-megabyte full-library bottleneck while keeping startup behavior and search semantics stable

User-visible flow ordering:

1. fetch summary list
2. rebuild `characters[]` with summary rows
3. restore active avatar selection if one exists
4. fetch only the active character's full payload when startup needs it
5. load groups and render the character list
6. emit `APP_READY` and hide the startup overlay

## Data / Integrations

### API surfaces

New route:

- `POST /api/characters/list`
  - returns summary rows only
  - becomes the route used by startup `getCharacters()` and normal list refreshes

Existing route kept:

- `POST /api/characters/get`
  - remains the source of full per-character payloads

Legacy route kept for compatibility:

- `POST /api/characters/all`
  - remains available during this slice
  - is no longer the route used by startup

### Summary payload definition

The summary payload is the current `toShallow()` contract, expanded to cover the text fields already used by `fuzzySearchCharacters()`.

It must include:

- existing list fields
  - `shallow`
  - `name`
  - `avatar`
  - `chat`
  - `fav`
  - `date_added`
  - `create_date`
  - `date_last_chat`
  - `chat_size`
  - `data_size`
  - `tags`
- existing nested fields already carried in `data`
  - `data.name`
  - `data.character_version`
  - `data.creator`
  - `data.creator_notes`
  - `data.tags`
  - `data.extensions.fav`
  - `data.extensions.world`
- added search fields
  - top-level compatibility mirrors:
    - `description`
    - `personality`
    - `scenario`
    - `first_mes`
    - `mes_example`
    - `creatorcomment`
    - `talkativeness`
  - `data.description`
  - `data.mes_example`
  - `data.scenario`
  - `data.personality`
  - `data.first_mes`
  - `data.alternate_greetings`
  - `data.extensions.talkativeness`

It must not include:

- `json_data`
- `data.character_book`
- large extension payloads not required for list/search behavior, such as regex scripts
- chat transcript data

### SQLite row content

Keep the current persistent row model:

- `full_json`
- `shallow_json`

Do not add:

- `search_json`

The `shallow_json` builder becomes the one place that defines startup/list/search-ready summary data.

Relationship to existing cache layers:

- the SQLite sidecar remains the derived source for summary and full payload rows when available
- the older disk cache remains an implementation detail for file-backed card parsing and must not become a second authority for startup summary semantics
- this slice does not redesign or remove the disk cache; it only requires that `/api/characters/list` and `/api/characters/get` expose one consistent payload contract regardless of whether data came from SQLite or filesystem parsing

### Client-side state

`characters[]` stays the primary in-memory library list, and its default row type after startup becomes the richer summary row.

Expected rules:

- `getCharacters()` fills `characters[]` from `/api/characters/list`
- `character.shallow === true` means summary-only and is expected after startup
- the richer summary row is still considered shallow if it lacks `json_data`, `data.character_book`, and other full-only fields
- `getOneCharacter()` replaces exactly one row with a full payload
- `unshallowCharacter()` stays the only supported upgrade primitive for deep data
- character search continues reading directly from `characters[]`

### Compatibility audit targets

This slice must audit internal deep readers systematically.

Required audit method:

1. search for every read of:
   - `json_data`
   - `data.character_book`
   - other clearly full-only fields added by `processCharacter()`
2. classify each caller as:
   - summary-safe
   - must unshallow first
   - can be rewritten to use summary data instead
3. add tests for the deep readers that must now upgrade rows

Known categories already confirmed in current code:

- character editor hidden JSON field reads
- extension field writers that parse and rewrite `character.json_data`
- world-info consumers that read `characters[chid].data.character_book`
- startup and chat flows that rely on the active character being full before use
- editor-entry helpers that call `select_selected_character(...)`
- current-character refresh flows in slash commands and world-info management that reopen the editor after mutation
- extension bulk writers that may run against a mixed shallow/full in-memory library and therefore must remain summary-safe even when they do not force hydration

Known compatibility boundary for this slice:

- the highest-risk audit target is not the startup fetch itself but the set of editor and mutation entrypoints that assume `characters[chid]` already contains `json_data`
- implementation should prefer a small number of choke points, such as editor-entry helpers and `unshallowCharacter()`, over scattered per-field guards

Search-specific note:

- `fuzzySearchCharacters()` also uses `#tags` through `getTagsList(character.avatar)`, not just `data.tags`
- the summary-first design keeps this working naturally because search still operates over `characters[]` and the avatar remains present

### Upgrade / migration

No canonical user data migration is required.

Derived-state migration rules:

- bump the character-index schema version
- rebuild SQLite rows from canonical PNG-backed data on first access after upgrade
- preserve old-version compatibility by rebuilding instead of attempting an in-place SQL transform

User-visible consequence:

- the first character-list open after upgrade may be slower once per user because derived rows rebuild
- later opens use the new summary contract and no longer pay the current startup bulk-payload cost

## Verification

Expected implementation proof:

```bash
npm test -- tests/interaction-performance-index.test.js
npm test -- tests/startup-critical-path.test.js
```

Expected performance proof:

```bash
node scripts/startup-performance-runner.mjs --url http://127.0.0.1:8000/
```

Primary evidence that this slice is done:

- startup network traces show `/api/characters/list`, not `/api/characters/all`, on the critical path
- startup `getCharacters` stage drops materially versus the current `4143.6 ms` production measurement
- startup critical-path transfer size for the character library drops from the current multi-megabyte full payload to a materially smaller summary payload, even if the result is still hundreds of KB to about 1 MB rather than tens of KB
- only one `/api/characters/get` request is observed during startup when reopening an already active character
- no `/api/characters/get` requests are observed during startup when no character is active
- character search still works immediately after startup without a second deferred route
- editor open, extension field mutation, world-info consumers, and active character chat load still work from a summary-first boot

Required manual checks:

1. Open the workspace with no active character and confirm the overlay disappears without a full-library payload request.
2. Reload with an active character and confirm only that character upgrades to full payload before chat-specific UI uses deep fields.
3. Trigger character search immediately after load and confirm results are available without waiting on any search warmup.
4. Open the character editor after startup and confirm `json_data` is present.
5. Use a character extension field write path and confirm the row unshallows before local `json_data` mutation.
6. Exercise a world-info consumer that reads `data.character_book` and confirm it forces full data before use.
7. Re-run with an existing pre-upgrade data root and confirm the one-time rebuild completes without manual migration.

Recommended automated coverage:

- route contract tests for `/api/characters/list`
- schema migration / rebuild tests for the expanded `shallow_json`
- targeted regression proof for the deep-reader choke points that call `unshallowCharacter()` before `json_data` or `character_book` access
- startup tests proving `getCharacters()` no longer depends on `/api/characters/all`
- search tests proving `fuzzySearchCharacters()` still returns equivalent results from the richer summary rows

## Doc ID Contract

No new semantic IDs are introduced.

Existing IDs affected by this slice:

- `feature.startup_bootstrap`
  - owner: `.docs/db/features/startup-bootstrap.md`
  - binding points: startup overlay timing and readiness gates in `public/script.js`
  - validation expectation: the workspace becomes usable after summary readiness, not after full-library preload
- `feature.character_library_panel`
  - owner: `.docs/db/features/character-library-panel.md`
  - binding points: character list fetch, summary render, search behavior, selection behavior
  - validation expectation: list browsing and search still work from summary metadata and card selection still resolves the active character correctly
- `page.chat_workspace`
  - owner: `.docs/db/pages/chat-workspace.md`
  - binding points: root workspace readiness and active-character restoration
  - validation expectation: the shell becomes usable earlier without losing active chat continuity
- `term.character_card`
  - owner: `.docs/db/terms/character-card.md`
  - binding points: the summary row remains the user-visible representation of one card, while full card data loads on demand
  - validation expectation: no semantic rename or user-facing concept split is introduced

## References

- `public/script.js`
- `public/scripts/group-chats.js`
- `public/scripts/power-user.js`
- `public/scripts/extensions.js`
- `public/scripts/world-info.js`
- `src/endpoints/characters.js`
- `src/endpoints/character-index.js`
- `src/server-startup.js`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/specs/260510-02-sqlite-index-perf-ab/design.md`
- `.docs/db/features/startup-bootstrap.md`
- `.docs/db/features/character-library-panel.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/terms/character-card.md`
- `artifacts/startup-performance/2026-05-11T04-25-53-141Z/report.json`
- `artifacts/startup-performance/2026-05-11T04-25-53-141Z/report.md`
- Inference: 2026-05-11 production inspection of `character-index.sqlite` on the Hostinger deployment showed `full_json` total size aligned with the measured decoded `/api/characters/all` payload, while the dominant removable bytes lived in `json_data`, `data.character_book`, and large extension payloads.
