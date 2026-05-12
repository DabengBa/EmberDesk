# Review: 260512-02-thumbnail-lazy-image-loading/design.md

## Verdict
Approve with revisions. The approach (native `loading="lazy"` + `decoding="async"` at the point of image definition) is the right level of complexity for this slice. The surface list is broadly correct, but the doc names a couple of templates that aren't actually template-owned in the way it implies, omits at least one obvious sibling surface, and underspecifies the dynamic-clone case.

## Strengths
- Native attributes over an IntersectionObserver implementation is the correct call — zero JS, graceful degradation, browser-tuned.
- Correctly excludes active-chat avatar rendering (script.js:2737, `messageElement.find('.avatar img').attr('src', ...)`), which is on the critical chat-paint path.
- The "follow ownership instead of forcing every change into one file" principle (line 73) is right: some surfaces are real templates, some are jQuery clones.

## Issues / Gaps

**1. "Template-owned surface" list is mis-stated for one of the four surfaces.**
The doc places `welcomePanel.html` under "template-owned" (line 95) but lists `public/script.js` and `public/scripts/group-chats.js` under "dynamic render surfaces" (lines 96–97). In reality:
- **welcomePanel.html:56** — Handlebars template with `<img src="{{char_thumbnail}}" alt="{{char_name}}">`. **Template-owned. ✓**
- **Character list** — uses `#character_template` (index.html:7218–7222: `<img src="">`) populated by `getCharacterBlock` (script.js:1073–1081, `template.find('img').attr('src', this_avatar)`). The `<img>` tag itself lives in `index.html`, not `script.js`. **The `<img>` is template-owned in index.html; only `src` is assigned dynamically.**
- **Inline avatar list** — `#inline_avatar_template` at index.html:7605–7609 (`<img src="">`). Same pattern: template-owned `<img>`, dynamic `src` via `buildAvatarList` (script.js:7635) and call site at script.js:7671.
- **Group member list** — `#group_member_template` at index.html:7529–7533 (`<img alt="Avatar" src="" />`). Template-owned `<img>`, dynamic `src` at group-chats.js:1690.

**Recommendation:** for all four list surfaces the `<img>` tags themselves are in HTML templates (`welcomePanel.html` and `index.html`). The static attributes should be added in those HTML files, not in JS. The "dynamic clone" case mentioned in the design only applies if the JS *creates* an `<img>` element (e.g., `new Image()` or `document.createElement('img')`), which doesn't apply here — the JS only sets `src` on an existing template img. Reframe the design around "all four list `<img>` tags live in HTML templates; edit those." This is simpler and more accurate.

**2. Missing surface: past-chat block.**
`#past_chat_template` (index.html:6763) is cloned at script.js:8730 (past-chats panel) and swipe-picker.js:133 (swipe picker). The clone code at script.js:8732 does `template.find('.avatar img').attr('src', avatarImg)`. This is functionally identical to the four listed surfaces and should be in scope, or explicitly named as deferred. Currently it isn't mentioned at all.

**3. Missing surface (or explicit exclusion): group-collage avatar template.**
group-chats.js:914 does `groupAvatar.find('.img_1').attr('src', group.avatar_url || system_avatar)` against `#group_avatars_template`. If group avatars in lists are visible, they're a list-style surface too. Decide in/out and name it.

**4. "Dynamic clone" state coverage (lines 59–60) is now redundant.**
Once issue #1 is corrected, there are no surfaces in this slice where JS creates a new `<img>` element. Either drop the dynamic-clone state, or pick a real example (e.g., if a future surface uses `new Image()` it should also be covered).

**5. `<img>` without `width`/`height` attributes may cause CLS.**
`loading="lazy"` defers fetch, but if the browser doesn't know the image dimensions, layout shift can occur as deferred avatars pop in. The current `.avatar img` rule (style.css:1447) sets width/height via CSS variables, so this may be a non-issue, but the design should explicitly note that CSS-sized boxes are why CLS isn't a concern here — otherwise a reviewer worried about Core Web Vitals has nothing to point at.

**6. `fetchpriority="auto"` is the right default, but skipped for above-the-fold avatars.**
Lazy-loading the very first avatars on the character list (before the user scrolls) means the browser may delay them slightly. For long-tail offscreen avatars this is the entire point. For the *first row* of a 1000-card library, lazy loading offers no benefit and a small cost. Modern browsers handle this via viewport heuristics, so it's likely fine, but the design could acknowledge that `loading="lazy"` on always-visible cards is a no-op-at-best and not harmful.

**7. Verification claim is thin.**
The automated proof (line 127) says "add focused DOM/unit tests where practical." This is hand-wavy. For HTML-template edits the proof is trivial — a single grep assertion that the attribute pair exists in `welcomePanel.html`, `index.html` templates would suffice. State it that concretely so the test scope is unambiguous.

## Suggested Acceptance Test Additions
- After this slice, `grep -E 'loading="lazy"\s+decoding="async"'` matches inside `welcomePanel.html` and inside `#character_template`, `#inline_avatar_template`, `#group_member_template` (and ideally `#past_chat_template`).
- Existing avatar edit flow (`script.js:7605`, `personas.js:439`, etc.) still produces a visible refresh after edit (no regression from interaction between lazy loading and cache-buster reloads).

## Minor
- The "character_select" template's `<img>` currently has neither `alt` nor `loading`. The character render JS adds `alt` dynamically (script.js:1081: `.attr('alt', item.name)`). Adding `loading="lazy" decoding="async"` to the HTML template `<img>` is consistent with that ownership split.
- Implementation note (line 99–104) lists "candidate call sites" but these are the *JS call sites that set `src`*. Once you accept issue #1, those JS sites don't need to change at all — only the HTML templates do. Update the implementation ownership accordingly.

## Bottom line
Direction correct, surface enumeration needs cleanup. Once the template-owned reframing (issue #1) is applied, this becomes a ~5-line HTML edit across `welcomePanel.html` and `index.html`, with no JS changes required. That's a simpler, smaller, easier-to-audit slice than the design currently implies.
