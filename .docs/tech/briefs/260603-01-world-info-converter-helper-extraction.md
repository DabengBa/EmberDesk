---
created: 2026-06-03
source: "User asked to read .docs/tech/modernization-roadmap.md, decide the next work from actual code, then write a separate step-by-step specs design file."
confirmed: true
last_updated: 2026-06-03
---

# Brief: 260603-01 World Info Converter Helper Extraction

## User Original Request

- "阅读 .docs\\tech\\modernization-roadmap.md , 根据项目代码实际情况决定下一步工作内容"
- "分步骤编写单独的specs开发设计文件"

Working interpretation before approval: the requested design target is the confirmed next modernization slice in `.docs/tech/modernization-roadmap.md`, namely extracting deterministic World Info external-format converters from `public/scripts/world-info.js` into a focused helper module with direct tests.

## Background & Motivation

The delivered modernization slices already extracted character-card helpers, chat import converters, and chat backup planning helpers. The roadmap now identifies World Info external conversion helpers as the next low-risk frontend slice. The current `public/scripts/world-info.js` still contains converter functions for Novel Lorebook, Agnai Memory Book, Risu Lorebook, and embedded Character Book data next to import side effects, DOM behavior, slash commands, prompt scanning, regex handling, and editor rendering.

The motivation is to reduce the size and risk of `public/scripts/world-info.js` without changing user-visible World Info workflows. The first deliverable should make converter behavior testable from fixture-shaped inputs while keeping file parsing, overwrite confirmation, save requests, editor refresh, `@sillytavern/scripts/world-info` exports, and Tavern Helper compatibility stable.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Next modernization slice | Continue the roadmap using actual code state, not stale planning text | Delivered | 2026-06-03: code mapping confirmed backend helper slices are delivered and world-info converters remain inside `public/scripts/world-info.js`; 2026-06-03: implementation extracted converters and advanced the roadmap next recommendation to World Info import UX feedback | Source: `.docs/tech/modernization-roadmap.md`, `.docs/tech/modernization-phase1-complexity-map.md`; code: `public/scripts/world-info.js`, `public/scripts/world-info-converters.js`; commit title: `refactor(world-info): extract converter helpers` |
| Behavior preservation | Keep external lorebook and embedded character-book import behavior unchanged | Delivered | 2026-06-03: repo mapping identified `importWorldInfo(file)` and `importEmbeddedWorldInfo()` as side-effect owners that should remain in `world-info.js`; 2026-06-03: implementation left file parsing, overwrite checks, API import, `saveWorldInfo()`, editor refresh, and import side effects in `world-info.js` | Binding points: `importWorldInfo(file)`, `importEmbeddedWorldInfo()`, `saveWorldInfo()`, `/api/worldinfo/import`; proof: `tests/world-info-converters.test.js`; commit title: `refactor(world-info): extract converter helpers` |
| Compatibility surface | Preserve existing public module exports used by first-party code and bundled Tavern Helper | Delivered | 2026-06-03: `convertCharacterBook` was confirmed as imported by `public/scripts/st-context.js` and `@sillytavern/scripts/world-info` consumers in bundled JS-Slash-Runner source; 2026-06-03: `world-info.js` now re-exports the helper import and `bun run test:compat` passed | Binding points: `public/scripts/st-context.js`, `public/scripts/extensions/third-party/JS-Slash-Runner/src/function/import_raw.ts`, `docs/third-party-extension-compatibility.md`; commit title: `refactor(world-info): extract converter helpers` |
| Regression proof | Add focused converter tests before moving production logic | Passed | 2026-06-03: no dedicated converter tests were found; 2026-06-03: red proof failed before helper creation because `world-info-converters.js` did not exist; 2026-06-03: green proof passed after helper extraction | Proof: `bun run --cwd tests test:unit -- world-info-converters.test.js --runInBand`, `bun run test:compat`; commit title: `refactor(world-info): extract converter helpers` |
| Follow-up UX corrections | Record import-flow UX issues without expanding the internal refactor slice | Captured for follow-up | 2026-06-03: user provided prioritized UX findings for loading feedback, no embedded-book messaging, format confirmation, actionable errors, richer overwrite context, and batch import; these should follow the converter extraction as separate UX work | Follow-up binding points: `importWorldInfo(file)`, `importEmbeddedWorldInfo()`, `#world_import_file`, overwrite popup flow, import error handling |

## Non-Goals

- Do not change World Info prompt activation, recursion, token budget, timed effects, regex placement, or slash-command behavior.
- Do not change World Info editor DOM, card templates, pagination, Select2 behavior, or visible import workflow.
- Do not change `/api/worldinfo/import`, file parsing, overwrite confirmation, save behavior, or editor refresh side effects.
- Do not remove or narrow the existing `convertCharacterBook` export from `@sillytavern/scripts/world-info`.
- Do not add loading states, new toasts, format preview/confirmation, richer overwrite prompts, retry UI, or batch import in this internal converter extraction slice.
- Do not update `.docs/db/` unless implementation later changes user-visible World Info semantics, which is not expected for this slice.
