# Character Card Write Command Intent

---
created: 2026-06-09
source: reconstructed from approved spec `.docs/specs/260609-02-character-card-write-command/spec.md`
confirmed: false
last_updated: 2026-06-09
---

## User Original Request

The original brainstorming turn is not available in this session. The approved spec records the intended request as: extract the character-card create/edit write path into a route-adjacent write command module while preserving canonical PNG card writes, thumbnail side effects, character-index refresh/delete ordering, and legacy HTTP response shapes.

## Background & Motivation

`src/endpoints/characters.js` still mixes Express adapter work, card formatting, PNG writes, upload cleanup, thumbnail policy, and derived character-index side effects. The project already extracted a read-side route service, so the next safe backend modernization step is to move single-card write orchestration behind a focused command boundary without changing file-backed canonical storage or browser callers.

## Intent Domains

### Character Card Write Boundary

- User expectation: create/edit character-card writes should become easier to test and reason about without broad endpoint rewrites.
- Current status: delivered on 2026-06-09.
- Change history:
  - 2026-06-09: Added `src/endpoints/character-write-service.js` with create/edit/rename single-card command orchestration and explicit filesystem, write, cache, and index dependencies.
  - 2026-06-09: Updated `src/endpoints/characters.js` so `/create`, `/edit`, and the related single-card `/rename` path delegate write orchestration while keeping route validation and response mapping in the route layer.
- Implementation traceability:
  - Code paths: `src/endpoints/character-write-service.js`, `src/endpoints/characters.js`.
  - Tests: `tests/character-write-service.test.js`, `tests/thumbnail-write-time-pregeneration.test.js`, `tests/interaction-performance-index.test.js`, `tests/express5-route-compatibility.test.js`.
  - Delivery status: implementation and review complete; wrap-up pending at time of brief creation.

## Non-Goals

- Do not migrate `/api/characters/import` or `/api/characters/merge-attributes` in this slice.
- Do not change the character card schema, TavernCard V2 conversion, tag import, world-book import prompts, or character editor UI.
- Do not make `DiskCache`, thumbnails, or `_cache/character-index.sqlite` canonical storage.
- Do not introduce new frontend request payloads or response shapes for existing browser callers.
