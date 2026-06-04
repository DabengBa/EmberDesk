---
created: 2026-06-04
source: "User said '继续' after the World Info import decision-quality slice was wrapped up; current roadmap recommends World Info batch import as the next work."
confirmed: false
last_updated: 2026-06-04
---

# Brief: 260604-02 World Info Batch Import

## User Original Request

- "继续"
- Active context before this request:
  - "阅读 .docs\\tech\\modernization-roadmap.md , 根据项目代码实际情况决定下一步工作内容"
  - "分步骤编写单独的specs开发设计文件"
  - The previous delivery workflow completed `260604-01-world-info-import-decision-quality`.

## Background & Motivation

The modernization roadmap now names World Info batch import as the next recommended slice after converter extraction, import busy feedback, and import decision-quality feedback were delivered.

Current code mapping confirms the batch gap is isolated:

- `public/panels/world-info-body.html` still defines `#world_import_file` without `multiple`.
- `public/scripts/world-info.js` still reads only `e.target.files[0]` in the file input change handler.
- `importWorldInfo(file)` already owns one complete single-file attempt: parsing, format detection, overwrite confirmation, `/api/worldinfo/import`, editor switch, and success/error feedback.
- `tests/world-info-import-feedback.test.js` currently locks in the single-file contract, including the absence of `multiple`.

The motivation is to let users import several World Info files from one file picker action while preserving the per-file decision context delivered on 2026-06-04 and avoiding a broad World Info module split.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Multi-file selection | The World Info import file picker should accept more than one supported file | Delivered | 2026-06-04: roadmap and code scan identify `multiple` input support as the next shippable UX/API slice; 2026-06-04: delivered with native file input `multiple` support | Code: `public/panels/world-info-body.html`; proof: `tests/world-info-import-feedback.test.js`; status: delivered in current wrap-up commit |
| Per-file sequencing | Each selected file should go through the same parse, format detection, overwrite decision, and import side effects as a single-file import | Delivered | 2026-06-04: current `importWorldInfo(file)` is a reusable single-file unit; 2026-06-04: delivered `importWorldInfoFiles(files)` as a sequential queue around `importWorldInfo(file)` | Code: `public/scripts/world-info.js`; proof: `tests/world-info-import-feedback.test.js`; status: delivered in current wrap-up commit |
| Duplicate prevention | While a batch is active, the import menu, file input, and drag/drop entry should not start a second queue | Delivered | 2026-06-04: existing `worldInfoImportBusy` already gates one import attempt and can cover the whole batch; 2026-06-04 review hardened pre-scan and drag/drop reentrancy | Code: `setWorldImportBusy()`, `importWorldInfoFiles(files)`, and `DragAndDropHandler` registration in `public/scripts/world-info.js`; proof: `tests/world-info-import-feedback.test.js`; status: delivered in current wrap-up commit |
| Partial outcomes | After a batch finishes, users should understand how many files imported, failed, skipped, or remained unprocessed after cancellation | Delivered | 2026-06-04: single-file toasts already explain per-file errors; 2026-06-04: delivered aggregate batch summary and structured single-file import results | Code: batch summary/result helpers in `public/scripts/world-info.js`; docs: [feature.world_info_panel](../../db/features/world-info-panel.md); proof: `tests/world-info-import-feedback.test.js`; status: delivered in current wrap-up commit |
| Drag/drop import | Users should be able to drop supported World Info files into the editor panel and use the same batch queue | Delivered | 2026-06-04: approved design revision added drag/drop as low-cost UX improvement | Code: `DragAndDropHandler` registration on `#world_popup` in `public/scripts/world-info.js`; proof: `tests/world-info-import-feedback.test.js`; status: delivered in current wrap-up commit |
| Conflict and cancel controls | Users should see one conflict summary for colliding filenames and be able to cancel remaining queued files | Delivered | 2026-06-04: approved design revision added overwrite-all, skip-all, individual-confirm, progress, and cancel-remaining controls | Code: conflict/progress/cancel helpers in `public/scripts/world-info.js`; proof: `tests/world-info-import-feedback.test.js`; status: delivered in current wrap-up commit |
| Scope preservation | Batch import should not change converter output, prompt activation, regex placement, slash-command registration, editor card DOM identity, pagination, or `/api/worldinfo/import` payload shape | Delivered | 2026-06-04: roadmap explicitly fences these surfaces out of the batch slice; 2026-06-04: validation confirmed converter behavior and lint stayed green | Proof: `world-info-converters.test.js`, `world-info-import-feedback.test.js`, `docs:check`, `docs:build`, and `lint`; status: delivered in current wrap-up commit |

## Assumptions

- The phrase "继续" means continue from the completed roadmap-guided workflow into the next roadmap-recommended spec.
- Batch import should preserve file picker selection order and process files sequentially.
- The existing one-file API remains the integration boundary; the batch is a frontend queue of single-file imports.
- The approved design expanded the initial brief by adding drag/drop import, batch conflict summary, progress feedback, and cancel remaining. Those revisions are delivered in this slice.
- Filename-derived World Info names remain the overwrite target because `/api/worldinfo/import` names the world from the uploaded file name.
- Existing per-file toasts remain the primary detail channel for file-specific failures. The new batch summary only aggregates counts.
- No retry queue, preview table, folder upload, clipboard paste upload, or persistent result panel is included in this slice.

## Non-Goals

- Do not add a new backend batch upload endpoint.
- Do not change Novel Lorebook, Agnai Memory Book, Risu Lorebook, Character Book, PNG, or native World Info JSON converter output.
- Do not change `/api/worldinfo/import`, `FormData` field names, `saveWorldInfo()`, editor refresh semantics, or `convertCharacterBook` public re-export compatibility.
- Do not touch regex placement values, slash-command registration, extension import aliases, prompt activation, recursion, inclusion groups, editor card DOM identity, pagination, or world-info file schema.
- Do not add retry UI or a persistent batch results panel in this slice.
