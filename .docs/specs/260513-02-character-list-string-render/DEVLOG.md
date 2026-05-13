# Character List String Render

## Why

The character library hot path was spending main-thread time on per-row jQuery `clone()`, `.find()`, and `.append()` operations during list rendering. For large libraries, this added measurable lag every time the character panel opened or refreshed. The safe single-row update case (favorite toggle, creator-notes save) was also triggering a full visible-page rerender.

## Delivered

### String-based character-row builder

`public/script.js` now uses `buildCharacterRowHtml(item, id)` instead of `$('#character_template .character_select').clone()` followed by repeated `.find()` mutations for `type === 'character'` entities.

The builder produces an escaped HTML string using `escapeHtml` from `public/scripts/utils.js`, covering:
- `data-chid` and `id="CharID${chid}"`
- avatar `src`/`alt`/title via `getThumbnailUrl`
- name text and title
- `is_fav` row class and `.ch_fav` value
- assistant badge removal for non-assistant rows
- creator-notes summary text or hidden state
- aux field text or hidden state for `power_user.aux_field`
- inline tags using `tag_map` and `tags` arrays (collapsed form matching `printTagList` with `isCharacterList: true`)
- avatar URL text when `power_user.show_card_avatar_urls` is enabled

Group rows, bogus-folder tag rows, back blocks, empty blocks, and hidden-count blocks keep their existing helper paths, so mixed entity pages remain behaviorally identical.

The original `getCharacterBlock()` body was replaced to delegate entirely to `buildCharacterRowHtml`.

### Row-local patch helper

`updateCharacterRow(chid, patch)` provides safe single-row DOM updates when:
- the row is currently visible in the DOM
- bogus-folder drilldown is not open
- the main character list has no active filters

Covered patch fields: favorite class/value, avatar thumbnail `src`/`alt`/title, creator-notes summary visibility/text, aux field visibility/text, inline character tags, and avatar URL text.

When the safety gate is not met or the row is off-page, the code falls back to existing `printCharactersDebounced()` or `printCharacters(true)` full-refresh behavior. Returns `false` when the row is not in the DOM.

### Existing side-effect preservation

Row patching and list rendering still trigger:
- `favsToHotswap()`
- `updatePersonaConnectionsAvatarList()`
- `eventSource.emit(event_types.CHARACTER_PAGE_LOADED)`

## Validation

### Lint

- `npm run lint` — clean on changed files

### Unit tests

- `npm --prefix tests run test:unit -- --runInBand` — 393/394 passed (1 pre-existing failure unrelated to this slice)

### Manual verification

- Character library opens with correct visible row content for large character sets
- Favorite toggle updates the visible row without full-page rerender or scroll jump
- Creator-notes and aux-field edits update only the visible row in default unfiltered list
- Tag add/remove updates row tag strip in place
- Filtered or bogus-folder states intentionally fall back to full refresh
- Group rows, bogus folders, empty state, and hidden-count blocks unchanged

## Documentation

Updated:
- `.docs/tech/interaction-performance-indexing.md` — added "Character-row string render fast path" section describing `buildCharacterRowHtml`, row-local patch rules, safety gates, and explicit fallback boundaries

## Doc ID Contract

- `feature.character_library_panel` — owner `.docs/db/features/character-library-panel.md`; character list rendering, visible row summary state, and repeat-open responsiveness remain functionally equivalent
- No new semantic IDs introduced

## Boundaries

- Only `type === 'character'` entities use the string fast path; groups, tags, and helper blocks stay on existing DOM path
- `renameCharacter()` flows that change avatar filename, rewrite tag keys, or reorder groups still reload `characters[]` and repaint fully
- Filtered lists, bogus-folder drilldowns, and off-page rows stay on full-refresh fallback
- Inline tag overflow expand path still hydrates through existing `printTagList()` DOM path; expanded tag markup is not precomputed in string form in this slice
- No pagination replacement, virtualization, or global jQuery removal in scope