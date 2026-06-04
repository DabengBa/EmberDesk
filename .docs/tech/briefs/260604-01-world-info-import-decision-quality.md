---
created: 2026-06-04
source: "User asked to read .docs\\tech\\modernization-roadmap.md and decide the next work based on current project code."
confirmed: true
last_updated: 2026-06-04
---

# Brief: 260604-01 World Info Import Decision Quality

## User Original Request

- "阅读 .docs\\tech\\modernization-roadmap.md , 根据项目代码实际情况决定下一步工作内容"
- Prior instruction context: "分步骤编写单独的specs开发设计文件"

## Background & Motivation

The modernization roadmap now recommends "World Info import decision quality" as the next implementation slice after two delivered World Info slices:

- converter helper extraction moved external lorebook converters into `public/scripts/world-info-converters.js`;
- import feedback added busy/disabled feedback and no-embedded-book informational messaging in `public/scripts/world-info.js`.

Current code mapping confirms the next gap is not another extraction. The import side-effect owner remains `importWorldInfo(file)`, and it still lacks user-facing decision context before destructive overwrite decisions:

- detected external format is logged to `console.log()` but not shown to the user;
- imported entry count is not surfaced before overwrite confirmation;
- parse failure still exposes raw technical error text through `toastr.error`;
- network/import failure still uses a generic `Failed to import World Info` toast;
- batch import is still intentionally not enabled by `#world_import_file`.

The motivation is to make a single-file import attempt understandable before the user confirms overwrite or sees an error, while preserving converter behavior, API shape, editor refresh, and compatibility surfaces.

2026-06-04 design review narrowed the intended behavior further:

- overwrite confirmation should use action-labeled buttons, not generic OK/Cancel;
- the same detected-format and entry-count context should appear in the success toast even when there is no overwrite conflict;
- `checkOverwriteExistingData()` should be extended with optional context/options rather than adding a second popup;
- PNG imports should distinguish character-card PNG data from PNG files with no importable embedded world info;
- large-file and 413 responses should get specific user-facing copy.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Detected format context | When EmberDesk auto-detects Novel Lorebook, Agnai Memory Book, Risu Lorebook, PNG, or native World Info JSON, the user should see that context before an overwrite decision | Delivered | 2026-06-04: roadmap and code scan identify format context as the next shippable UX slice after import feedback; 2026-06-04: delivered via `detectWorldInfoImportMetadata()` and shared import summary helpers | Code: `public/scripts/world-info.js`; Proof: `tests/world-info-import-feedback.test.js`; Docs: `feature.world_info_panel`; Commit: wrap-up commit for this slice |
| Entry-count context | Before overwriting an existing world book, the user should see how many entries the imported file contains when the count is available | Delivered | 2026-06-04: current overwrite popup only receives the target name and existing list, not imported entry metadata; 2026-06-04: delivered through `countWorldInfoEntries()` and overwrite context HTML | Code: `public/scripts/world-info.js`, `public/scripts/utils.js`; Proof: `tests/world-info-import-feedback.test.js`; Docs: `feature.world_info_panel`; Commit: wrap-up commit for this slice |
| Success feedback context | After any successful single-file import, including no-conflict imports, the user should see what format and how many entries were imported when available | Delivered | 2026-06-04: design review identified no-conflict imports as otherwise lacking decision/result context; 2026-06-04: delivered through success toast summary and automatic-switch message | Code: `public/scripts/world-info.js`; Proof: `tests/world-info-import-feedback.test.js`; Docs: `feature.world_info_panel`; Commit: wrap-up commit for this slice |
| Destructive confirmation affordance | Overwrite confirmation should use action labels and focus Cancel by default to reduce accidental destructive confirmation | Delivered | 2026-06-04: review accepted action-labeled CTA and accessibility feedback; code scan confirms `Popup.show.confirm()` already supports button/default/focus options; 2026-06-04: delivered by optional `confirmOptions` on `checkOverwriteExistingData()` | Code: `public/scripts/utils.js`, `public/scripts/world-info.js`; Proof: `tests/world-info-import-feedback.test.js`; Docs: `feature.world_info_panel`; Commit: wrap-up commit for this slice |
| Actionable error copy | Import failures should describe the user action: unsupported format, damaged file, or connection/import failure | Delivered | 2026-06-04: current parse and import errors are either raw technical text or generic failure toasts; 2026-06-04: delivered through parse, unsupported-format, 413, and generic import failure branches | Code: `public/scripts/world-info.js`; Proof: `tests/world-info-import-feedback.test.js`; Docs: `feature.world_info_panel`; Commit: wrap-up commit for this slice |
| PNG no-data specificity | PNG failures should distinguish character-card data without world info from PNGs with no embedded import data | Delivered | 2026-06-04: review identified different user recovery paths; code scan confirms `extractDataFromPng()` supports identifier-specific `naidata` and `chara` reads; 2026-06-04: delivered by `naidata` first read plus `chara` fallback probe | Code: `public/scripts/world-info.js`; Proof: `tests/world-info-import-feedback.test.js`; Docs: `feature.world_info_panel`; Commit: wrap-up commit for this slice |
| Large file handling | Large local files and server 413 responses should get specific feedback instead of generic import failure | Delivered | 2026-06-04: review accepted this as an edge-case UX branch for embedded PNG/world-info payloads; 2026-06-04: delivered with a 10MB client-side informational warning and 413-specific error copy | Code: `public/scripts/world-info.js`; Proof: `tests/world-info-import-feedback.test.js`; Docs: `feature.world_info_panel`; Commit: wrap-up commit for this slice |
| Scope preservation | Decision-quality work should not change converter output, API payload names, editor DOM identity, regex/slash-command surfaces, or batch import behavior | Delivered | 2026-06-04: roadmap explicitly separates decision quality from batch import and higher-risk World Info internals; 2026-06-04: converter proof and focused import proof confirmed API/converter boundaries stayed stable | Code: `public/scripts/world-info.js`, `public/scripts/utils.js`; Proof: `tests/world-info-import-feedback.test.js`, `tests/world-info-converters.test.js`; Docs: `modernization-roadmap`, `feature.world_info_panel`; Commit: wrap-up commit for this slice |

## Assumptions

- This is a single-file import UX slice.
- The implementation may add a small local helper around import metadata detection inside `public/scripts/world-info.js`, but should not move converter logic again.
- Existing native SillyTavern World Info JSON imports remain supported even when no external converter is selected.
- The user-facing native format label should be `World Info JSON` or `EmberDesk JSON`; compatibility with SillyTavern can be mentioned in supported-format lists, not as the primary label.
- If entry count cannot be safely determined, the UI should omit the count rather than guessing.
- Raw errors should remain in `console.error` for debugging, but not be the primary user-facing message.
- Extending `checkOverwriteExistingData()` with optional context and confirm options is lower risk than introducing a second confirmation step, because existing callers can keep defaults.
- The current automatic editor switch to the imported world should remain, but the success toast should make that state change visible.

## Non-Goals

- Do not add multi-file batch import.
- Do not add a full preview table or per-entry review flow.
- Do not add retry buttons unless a later design defines retry state and duplicate-submission behavior.
- Do not change Novel Lorebook, Agnai Memory Book, Risu Lorebook, or Character Book converter output.
- Do not change `/api/worldinfo/import`, `FormData` field names, `saveWorldInfo()`, editor refresh, or `convertCharacterBook` public re-export compatibility.
- Do not touch regex placement values, slash-command registration, extension import aliases, prompt activation, recursion, inclusion groups, or editor card DOM identity.
