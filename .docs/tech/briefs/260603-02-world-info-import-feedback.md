---
created: 2026-06-03
source: "User asked to continue from .docs/tech/modernization-roadmap.md and provided prioritized World Info import UX corrections after the converter helper extraction."
confirmed: true
last_updated: 2026-06-03
---

# Brief: 260603-02 World Info Import Feedback

## User Original Request

- "阅读 .docs\\tech\\modernization-roadmap.md , 根据项目代码实际情况决定下一步工作内容"
- "分步骤编写单独的specs开发设计文件"
- UX follow-up after the World Info converter extraction:
  - "导入无 loading 状态 — 用户不知道系统在工作"
  - "无嵌入世界书时静默返回 — 用户不知道发生了什么"
  - "格式自动检测无确认"
  - "错误信息缺乏可操作性"
  - "覆盖确认 popup 信息密度不足"
  - "批量导入缺失"

Working interpretation before approval: the next shippable slice should implement only the first two high-priority UX corrections: visible busy feedback for World Info file import and an informational toast when a selected character has no embedded World/Lorebook data.

## Background & Motivation

The previous World Info modernization slice extracted external-format converters from `public/scripts/world-info.js` into `public/scripts/world-info-converters.js` and left the side-effect import flows in place. The roadmap now recommends World Info import UX feedback as the next follow-up.

Current code mapping shows two low-risk user-visible gaps:

- `importWorldInfo(file)` parses, converts, checks overwrite, posts to `/api/worldinfo/import`, refreshes the editor selector, and emits final success/error toasts, but the file input change handler does not mark the import action busy while work is in progress.
- `importEmbeddedWorldInfo(skipPopup)` returns silently when `checkEmbeddedWorld(chid)` reports no embedded book, so a user who explicitly invokes the import action receives no explanation.

The motivation is to make long-running or empty import actions observable without changing converter behavior, supported formats, overwrite semantics, save behavior, or batch-import behavior.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Import busy feedback | After choosing a world file, the UI should immediately show that import is in progress and prevent accidental duplicate import clicks until the current attempt finishes | Delivered | 2026-06-03: roadmap and UX feedback identified missing loading state as the highest-priority follow-up after converter extraction; 2026-06-03: implementation added `setWorldImportBusy()`, import menu guard, spinner state, disabled file input, and a loading toast restored in `finally` | Binding points: `#world_import_file`, `#world_import_menu_item`, `importWorldInfo(file)`, `public/scripts/world-info.js`; proof: `tests/world-info-import-feedback.test.js`; commit title: `feat(world-info): add import feedback` |
| Empty embedded book feedback | When a selected character card has no embedded World/Lorebook data, the user should receive a concise informational message instead of a silent return | Delivered | 2026-06-03: UX feedback identified silent no-op in `importEmbeddedWorldInfo()` as the second-priority correction; 2026-06-03: valid selected-character no-embed paths now emit an info toast while invalid `chid` paths remain silent | Binding points: `importEmbeddedWorldInfo(skipPopup)`, `checkEmbeddedWorld(chid)`, `characters[chid]?.data?.character_book`; proof: `tests/world-info-import-feedback.test.js`; commit title: `feat(world-info): add import feedback` |
| Import semantics preservation | The follow-up should not change file parsing, converter outputs, overwrite checks, API payloads, save behavior, editor refresh, or compatibility exports | Delivered | 2026-06-03: previous converter slice deliberately separated converter logic from import side effects, making this UX slice local to import feedback; 2026-06-03: implementation left converter modules, `/api/worldinfo/import`, `FormData`, overwrite confirmation, save behavior, editor refresh, and `convertCharacterBook` re-export unchanged | Binding points: `public/scripts/world-info-converters.js`, `/api/worldinfo/import`, `saveWorldInfo()`, `convertCharacterBook` re-export; proof: `tests/world-info-converters.test.js`, `bun run test:compat`; commit title: `feat(world-info): add import feedback` |
| Follow-up backlog | Format preview, actionable error copy, richer overwrite context, and batch import remain valuable but require separate design because they alter confirmation, error, or multi-file flow semantics | Deferred | 2026-06-03: UX list captured six issues; this brief scopes the first two only; 2026-06-03: roadmap now recommends import decision quality next, with batch import kept as a later UX/API slice | Future binding points: format detection branch, `checkOverwriteExistingData()`, import error handling, file input `multiple` support |

## Non-Goals

- Do not change Novel Lorebook, Agnai Memory Book, Risu Lorebook, or Character Book converter behavior.
- Do not change `/api/worldinfo/import`, request body names, save behavior, editor refresh, or `convertCharacterBook` public export compatibility.
- Do not add format-preview confirmation in this slice.
- Do not rewrite error taxonomy or add retry buttons in this slice.
- Do not enrich the overwrite confirmation with entry counts in this slice.
- Do not add multi-file batch import in this slice.
- Do not redesign the World Info toolbar or drawer layout.
