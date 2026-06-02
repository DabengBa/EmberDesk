---
created: 2026-06-02
source: "User asked to clarify the next work, then invoked $brainstorming for the next modernization slice."
confirmed: true
last_updated: 2026-06-02
---

# Brief: 260602-01 Characters Pure Helper Extraction

## User Original Request

- "明确接下来的工作内容"
- "$brainstorming"

Working interpretation before approval: the requested brainstorming target is the first near-term roadmap slice identified after Phase 0 and Phase 1, namely extracting pure character-card helper logic from `src/endpoints/characters.js` before any broader endpoint split.

## Background & Motivation

Phase 0 established green local gates and documented remaining proof gaps. Phase 1 mapped the highest-complexity modernization targets and concluded that `src/endpoints/characters.js` should start with pure helper boundaries rather than route-level file splitting. The user now needs a shippable design for that first implementation slice.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| First modernization implementation slice | Start with the safest concrete slice after Phase 0/1 instead of broad refactor | Delivered | 2026-06-02: inferred from updated roadmap and explicit `$brainstorming` request; 2026-06-02: implemented as the first post-Phase-1 slice | Code: `src/endpoints/character-card-helpers.js`, `src/endpoints/characters.js`; commit: `refactor(characters): extract card helpers`; delivery status: delivered |
| Behavior preservation | Keep existing character API and user-visible behavior unchanged while improving testability | Delivered | 2026-06-02: Phase 1 marked `/api/characters/all`, `/api/characters/get`, `DiskCache`, SQLite index, and mutation side effects as protected; 2026-06-02: `readFromV2` stayed in `characters.js` to avoid changing subtle default/warning behavior | Binding points preserved: `/api/characters/all`, `/api/characters/get`, `DiskCache`, SQLite index helpers, thumbnail side effects; semantic docs unchanged because behavior stayed internal |
| Regression proof | Add focused tests before moving helper logic | Delivered | 2026-06-02: Phase 0 requires focused validation; Phase 1 recommends helper-level tests before route split; 2026-06-02: red proof failed before helper module existed, then focused and guard suites passed | Tests: `tests/character-card-helpers.test.js`; guard proof: `interaction-performance-index.test.js`, `thumbnail-write-time-pregeneration.test.js`; lint: `bun run lint` |

## Non-Goals

- Do not split `src/endpoints/characters.js` by route in this first slice.
- Do not change `/api/characters/all` or `/api/characters/get` response shapes.
- Do not change canonical file-backed character storage.
- Do not change `DiskCache` or `_cache/character-index.sqlite` semantics.
- Do not change thumbnail invalidation/pregeneration side effects.
- Do not update `.docs/db/` unless implementation later changes user-visible behavior, which is not expected for this slice.
