# Character List String Render

## Intent & Core Flow

Intent: reduce visible lag in the character library by removing the per-row jQuery clone/find/append path for character cards, and by patching one visible character row in place for a narrow set of safe metadata updates.

Primary actor: a browser user opening the character library panel or editing one visible character during a normal workspace session.

Happy path:

1. The user opens or refocuses the character library panel.
2. `printCharacters()` still builds the same mixed entity page, but character rows render through an escaped HTML-string fast path instead of `$('#character_template .character_select').clone()` plus repeated `.find()` mutations.
3. Group rows, bogus-folder tag rows, back blocks, empty blocks, and hidden-count blocks keep their existing helper path and ordering.
4. The user toggles favorite state or saves character summary metadata while the current page is an unfiltered normal character list.
5. EmberDesk updates only that visible row through `updateCharacterRow(chid, patch)` and refreshes any dependent side surfaces such as hotswaps and persona avatar connections.
6. If the row is not visible or the current list state could change membership or ordering, EmberDesk falls back to the existing full-list refresh path.

## Scope / Out of Scope

In scope now:

- replace `getCharacterBlock()` with a string-based character-row builder
- keep the existing pagination plugin and `printCharacters()` orchestration
- apply the fast path only to `type === 'character'` entities in the main character library
- add a row-local patch helper for the first safe field set:
  - favorite class/value
  - avatar thumbnail `src`, `alt`, and title
  - creator-notes summary visibility/text
  - aux field visibility/text for `power_user.aux_field`
  - inline character tags
  - avatar URL text when `power_user.show_card_avatar_urls` is enabled
- use the row-local patch helper only when:
  - the row is currently rendered on the visible page
  - bogus-folder drilldown is not open
  - the main character list has no active filters
- route these patch-safe success paths to the helper before falling back:
  - normal character edit/save flows that refresh the current character in place
  - single-row favorite toggles such as the bulk/context favorite path
  - single-character tag add/remove flows

Out of scope now:

- `renameCharacter()` flows that change avatar filename, rewrite tag keys, rename group members, and reload `characters[]`
- any change that may reorder rows or move them across pagination boundaries
- patching filtered list states, bogus-folder drilldown views, or pages where the row is not visible
- group row, tag row, back block, empty block, and hidden block rewrites
- pagination replacement, virtualization, or global jQuery removal
- bulk multi-character tag mutations beyond the already-visible single-row favorite case

First shippable slice:

- character rows stop using per-row clone/find/append during list rendering
- safe single-row updates stop repainting the whole visible page in the default unfiltered character list
- unsafe or off-page mutations keep the current full refresh behavior

## Edge Rules / Acceptance

Acceptance outcomes:

- Character rows must preserve the current visible summary contract from `getCharacterBlock()`:
  - `data-chid` and `id="CharID${chid}"`
  - avatar `src` and `alt`
  - avatar title text
  - name text and title
  - `is_fav` row class and `.ch_fav` value
  - assistant badge removal for non-assistant rows
  - creator-notes summary text or hidden state
  - aux field text or hidden state
  - inline tags filtered the same way as `printTagList(..., { tagOptions: { isCharacterList: true } })`
- String rendering must keep the current XSS safety level. Text fields that previously used `.text()` must now be escaped through the existing `escapeHtml` helper.
- Mixed entity pages must preserve current order and behavior for group rows, bogus folders, empty state, and hidden-count rows.
- Existing delegated row interactions must continue to work after string insertion, including row click, context-menu actions, and drag/drop entry points bound from `document`.
- Inline tag overflow still needs a working expand path. The first slice may hydrate only that row back through `printTagList(...)` when the user clicks the placeholder instead of solving expanded tag markup entirely in string form.
- `updateCharacterRow(chid, patch)` must return `false` and do nothing when the row is not currently present in the DOM.
- When the safe-update gate is not met, the code must keep the existing `printCharactersDebounced()` or `printCharacters(true)` fallback instead of guessing.

State coverage:

- `loading`
  - current pagination and panel loading behavior stays unchanged
- `empty`
  - zero-character and empty-filter results keep the existing empty block behavior
- `success`
  - character rows render faster while matching current visible content
  - safe single-row favorite or summary updates avoid a full visible-page rerender in the default unfiltered list
- `error`
  - character save, favorite, and tag mutation failures keep the current failure handling; the fast path must not hide an unsuccessful backend write

Recovery boundaries:

- If the string builder cannot safely represent a case, the implementation should fall back to the existing DOM-building path rather than widen scope mid-slice.
- If a row patch misses because the row is off-page or the view state is unsafe, the existing full refresh path remains the recovery behavior.

## Architecture / Constraints

Confirmed repo constraints:

- `public/script.js` currently imports `escapeHtml` from `public/scripts/utils.js`; no new escaping helper is needed.
- `printCharacters()` renders a mixed `character` / `group` / `tag` entity list from `getEntitiesList(...)`; this slice cannot honestly assume a character-only page.
- `renameCharacter()` currently reloads characters, rewrites related references, and reselects the renamed character; that is broader than a row-only patch.
- `printTagList()` currently owns tag sorting, filtering, overflow placeholder creation, and click bindings for expanded lists.

Core design choice:

1. Precompile the character row template into a reusable string form.
2. Add `buildCharacterRowHtml(item, id)` that fills the row with escaped values from existing client state.
3. Add a narrow string helper for the initial collapsed character-tag markup used only inside character rows.
4. Keep `printCharacters()` as the page orchestrator, but batch character rows as HTML strings and flush them in larger writes instead of one DOM append per row.
5. Keep non-character blocks on their current helper path so mixed pages still behave the same.
6. Add `updateCharacterRow(chid, patch)` for the safe field set only.
7. Gate row-local patching behind the first-slice rule: unfiltered main list, bogus-folder drilldown closed, row currently visible.

Implementation constraints:

- Do not add new dependencies.
- Do not replace the pagination plugin.
- Do not change server APIs, storage, or Doc ID ownership.
- Preserve existing side effects that the list refresh currently triggers where still relevant:
  - `favsToHotswap()`
  - `updatePersonaConnectionsAvatarList()`
  - `eventSource.emit(event_types.CHARACTER_PAGE_LOADED)`
- Prefer targeted fallback over duplicating the full `printTagList()` feature set in string form.

## Data / Integrations

Inputs already owned by the client:

- `characters[]`
- `tag_map` and `tags`
- `power_user.show_card_avatar_urls`
- `power_user.aux_field`
- `entitiesFilter`
- `#character_template .character_select`

Helpers and integrations that remain the source of truth:

- `getThumbnailUrl(...)` and `default_avatar` for avatar image selection
- `getPermanentAssistantAvatar()` for assistant badge behavior
- `printTagList(...)` for full DOM tag hydration when the row needs expanded tag behavior
- `favsToHotswap()` for right-nav favorite avatars
- `updatePersonaConnectionsAvatarList()` for persona-related avatar surfaces

No API or storage changes are part of this slice:

- no new backend route
- no payload shape change
- no cache or schema migration

## Verification

Expected implementation proof:

```bash
npm run lint
npm --prefix tests run test:unit -- --runInBand interaction-performance-character-list-render.test.js
```

Expected test coverage:

- row HTML equivalence for representative characters:
  - plain
  - favorite
  - with creator notes
  - with aux field
  - with hidden assistant badge
  - with visible tags
- escaping proof for name, creator notes, and aux field text
- `updateCharacterRow(chid, patch)` success and no-op behavior
- fallback proof that active filters or bogus-folder drilldown still choose the full refresh path

Required manual checks:

1. Open the character library with a large character set and confirm visible row content matches today.
2. Toggle favorite on a visible character in the default unfiltered list and confirm the row updates without a full visible-page rerender or scroll jump.
3. Edit a character's creator notes or aux field, save, and confirm only the visible row changes in the default unfiltered list.
4. Add and remove a tag from one visible character in the default unfiltered list and confirm the row tag strip updates.
5. Repeat the same mutations with active filters or bogus-folder drilldown and confirm EmberDesk intentionally falls back to the current full refresh behavior.
6. Expand a row's hidden tags and confirm the row still supports the existing expanded-tag behavior.
7. Reopen pages containing group rows, bogus folders, empty state, and hidden-count state to confirm those surfaces are unchanged.

Expected performance evidence:

- a browser performance trace shows materially less main-thread time inside character-library render on large unfiltered pages
- the hot path no longer performs one jQuery clone/mutate/append cycle per visible character row

## Doc ID Contract

No new semantic IDs are introduced.

Existing ID affected by this slice:

- `feature.character_library_panel`
  - owner: `.docs/db/features/character-library-panel.md`
  - binding points: character list rendering, visible row summary state, repeat-open responsiveness
  - validation expectation: browsing the character library remains functionally equivalent while large unfiltered list renders and safe row-local updates become cheaper

Documentation follow-up after delivery:

- update `.docs/tech/interaction-performance-indexing.md` with the front-end character-row string-render fast path and row-local patch rules

## References

- `public/script.js`
- `public/scripts/tags.js`
- `public/scripts/BulkEditOverlay.js`
- `public/scripts/RossAscends-mods.js`
- `public/scripts/utils.js`
- `.docs/db/features/character-library-panel.md`
- `.docs/tech/interaction-performance-indexing.md`
