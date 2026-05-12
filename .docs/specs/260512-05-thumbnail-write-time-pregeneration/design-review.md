# Review: 260512-05-thumbnail-write-time-pregeneration/design.md

## Verdict
Approve with revisions. The "hook the shared write helper" idea is the right architectural call and avoids duplicating route-level hooks. But the design's claim that this strategy covers all character writes is **not actually true given the current code** — at least one mutation path (`/duplicate`) bypasses `writeCharacterData`. The design also leaves response-time semantics undefined, which matters because Jimp pregeneration is synchronous and can be slow.

## Strengths
- Correctly identifies `writeCharacterData` (characters.js:244) as the centralized character image write helper. Verified: 14 call sites across `/create`, `/rename`, `/edit`, `/edit-avatar`, `/edit-attribute`, `/merge-attributes`, and multiple import paths all funnel through it (characters.js:1013/1059/1131/1161/1187/1214/1247/1274/1298/1304/1342/1386/1391/1431/1491/1568).
- Correctly preserves existing `invalidateThumbnail` calls and orders invalidation before write (line 23).
- Correctly degrades to on-demand `/thumbnail` route if pregeneration fails (line 47). This is essential — pregeneration must never block canonical persistence.
- Honest about not backfilling existing libraries (lines 33, 63, 125).

## Issues / Gaps

**1. `/duplicate` bypasses `writeCharacterData` — coverage gap.**
`characters.js:1981`:
```js
fs.copyFileSync(filename, newFilename);
```
The duplicate route copies the source PNG directly without going through `writeCharacterData`. If pregeneration is hooked inside `writeCharacterData`, duplicated characters will *not* get a pregenerated thumbnail. The user duplicating a card will still pay the on-demand cost on first view.

This contradicts the first-shippable-slice claim (line 37): "all new character writes ... produce ready-to-serve thumbnails." Either:
- Hook pregeneration after the copy at characters.js:1981, OR
- Restate the slice as "all new character writes that go through `writeCharacterData`" and explicitly defer `/duplicate`, OR
- Refactor `/duplicate` to share thumbnail-pregeneration with `writeCharacterData` via a small helper.

The first option is cheap (~3 lines) and matches the design's intent. The design should pick one and say so.

**2. Persona "shared write helper" claim is overstated.**
Line 71 says "persona writes are centralized in the persona upload endpoint." Verified, but the write is *inline in the route handler* at avatars.js:58, not behind a helper function like `writeCharacterData`. That's fine for now (only one route writes personas), but the design's symmetry-with-character-side phrasing suggests there's a helper to hook. There isn't. Either factor one out or just inline the pregeneration call after avatars.js:58 and drop the "centralized helper" framing for personas.

**3. Response-time semantics are unspecified.**
`generateThumbnail` is async but its real cost is Jimp's synchronous image decode/resize/encode, which can take tens to hundreds of milliseconds per image depending on source size. Critical questions the design doesn't answer:
- Does the mutation route `await` pregeneration before responding? (If yes, every character create/edit pays the cost; if no, there's a window where the file exists but the thumbnail doesn't.)
- For bulk import (characters.js:1902, looped imports), is pregeneration awaited per-file or batched?
- If pregeneration fails, is the failure logged with enough detail to debug, or silently swallowed?

The hard constraint on line 85 ("do not block canonical file persistence on pregeneration failure") only addresses *failure*, not *latency*. State the intended behavior explicitly. Recommendation: fire pregeneration *after* the response is sent (or via `setImmediate` / `queueMicrotask`) so the user sees mutation success at normal speed, with the thumbnail materializing in the brief window before the next page load. Failure semantics are unchanged because `/thumbnail` still falls back.

**4. Bulk import latency risk is understated.**
Line 124 says "bulk imports may take slightly longer per request." For users importing 100+ cards via the import flow, "slightly" can compound into a meaningful delay (e.g., 100ms × 100 = 10s added to the operation). The design should either:
- Explicitly accept this with an estimate ("per-card cost ~X ms, batch cost may be noticeable for libraries > N"), or
- Mark bulk import as a non-awaited path (kick off pregeneration and don't block the response).

**5. Animated/skipped behavior — already handled but worth pinning.**
`generateThumbnail` returns `{ path: null, ... }` for animated WebP, APNG, and `SKIPPED_EXTENSIONS` extensions (thumbnails.js:107, 158, 168, 173). So calling it from `writeCharacterData` is safe even for animated avatars. The design says this on line 46 — good. One ambiguity: the design's "isKnownAnimated" parameter on `generateThumbnail` exists for callers that already know the answer; if `writeCharacterData` calls it without that hint, every write re-runs animation detection. For characters (which are always PNG via `write()` at characters.js:280), `isKnownAnimated: false` is correct and skips the detection. For personas, the source can be anything users upload, so leave as `null`. Worth stating the per-class hint values.

**6. Concurrency / race with `/thumbnail` on-demand path.**
If the user clicks edit-avatar and is immediately fast enough to hit `/thumbnail` before pregeneration finishes, both paths will try to write the same cached file. `processSingleImage` uses `writeFileAtomicSync` (thumbnails.js:235), so atomic-rename prevents a torn file, but you can get a "last writer wins" race where the second generation overwrites the first identical output — wasted work, not a correctness bug. Worth a one-line acknowledgment; no action needed.

**7. Verification: "tests that pregeneration failure does not fail the source write."**
Make this concrete: inject a `generateThumbnail` mock that throws, assert the route still returns 200 and the canonical `.png` exists on disk. The hard constraint at line 85 is load-bearing; pin it with a real test.

## Suggested Acceptance Test Additions
- After `POST /api/characters/duplicate`, the duplicate's thumbnail file exists. (Catches issue #1 if not addressed.)
- After `POST /api/v1/avatars/upload`, the persona thumbnail file exists at the persona thumbnail folder.
- After `POST /api/characters/edit-avatar`, the old thumbnail is invalidated *and* a new thumbnail is generated — verify both events occur in the correct order.
- Latency budget test: a single character edit completes in ≤ N ms (where N reflects whether the design chose blocking vs. non-blocking pregeneration).

## Minor
- The "Interacting code surfaces" list (lines 116–119) includes `public/script.js` because of the existing client-side cache refresh. That refresh stays unchanged. Worth one line saying explicitly: client-side `cache: 'reload'` refresh after avatar edit (script.js:7605–7606, etc.) becomes redundant once pregeneration ships, because the file is already current — but the refresh is still harmless and removing it is out of scope.
- The "first-view thumbnail generation stalls" phrasing (line 5) is a real win; consider linking to the existing perf benchmark spec (0f7146497 `perf: add interaction benchmark tooling and specs`) so a future operator can measure the improvement against a baseline.

## Bottom line
Right architecture. Two real gaps before delivery: (a) `/duplicate` bypasses the chosen hook and the design needs to either cover it or explicitly defer it; (b) response-time semantics (await-and-block vs fire-and-forget) need to be specified, because the wrong choice turns this into a perf regression for bulk import. With those pinned, this is a high-value slice.
