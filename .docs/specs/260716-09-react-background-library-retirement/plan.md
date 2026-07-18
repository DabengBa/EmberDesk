# React Background Library Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-09-react-background-library-retirement.md`
Doc IDs: feature.background_library_panel, page.chat_workspace

## Tasks

### Task 1: 抽出 background catalog/action service
- [x] **Done**
- **Reqs:** R1, R2, R3, R5
- **Kind:** behavior
- **Scope:** `public/scripts/backgrounds.js`, new focused background service modules, API/settings/media adapters, unit tests
- **Proof:** command: bun run --cwd tests test:unit -- background-panel-controller.test.js thumbnail-lazy-image-loading.test.js thumbnail-cache-headers.test.js thumbnail-write-time-pregeneration.test.js --runInBand
- **PM:** 对 global/chat fixture 执行 load/select/lock/upload/rename/delete/refresh 与错误 -> service result 和持久状态一致且不读写 gallery DOM
- **Doc IDs:** feature.background_library_panel
- **Evidence:** evidence/task-01.md

### Task 2: 让 React gallery 独立拥有完整 Background Library 行为
- [x] **Done**
- **Reqs:** R1, R2, R3, R5
- **Kind:** behavior
- **Scope:** Background React panel/components/forms, TanStack queries/mutations, focus/reconcile tests
- **Proof:** command: bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js background-panel-controller.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 浏览 folders、过滤/排序、选择/锁定、上传/重命名/删除 -> UI 和 settings/media 结果一致，无 hidden DOM action
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 将 slash commands 接到同一 service 并收缩 public barrel
- [x] **Done**
- **Reqs:** R4, R6
- **Kind:** behavior
- **Scope:** `public/scripts/backgrounds.js`, slash registration/callbacks, compat/unit tests
- **Proof:** command: bun run test:compat && bun run --cwd tests test:unit -- background-panel-controller.test.js --runInBand
- **PM:** 分别从 UI 与 `/lockbg`、`/unlockbg`、`/autobg` 执行操作 -> metadata、可见背景和返回结果一致
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 删除 legacy panel/controller/flag/fallback
- [x] **Done**
- **Reqs:** R7
- **Kind:** behavior
- **Scope:** legacy background HTML/CSS/handlers, `public/scripts/background-panel-controller.js`, `public/script.js`, workspace flags/mount paths/tests
- **Proof:** command: bun run build:react:workspace-panels && bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js background-panel-controller.test.js --runInBand
- **PM:** 打开 Backgrounds 并检查 DOM/source -> 只有 React gallery，无 legacy host、flag 或 fallback
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 完成 persistence、mobile、compat 与文档验证
- [x] **Done**
- **Reqs:** R3, R4, R8
- **Kind:** behavior
- **Scope:** background E2E/compat tests, semantic docs, ledger/history
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- background-action-persistence.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1 && bun run docs:check
- **PM:** desktop/mobile 完成 global/chat、upload、lock、slash、reload -> 行为和持久化完整，文档为 sole owner
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [x] Review complete

### Review notes
- Confirmed and fixed: React sole-owner hid folder drill-in with no React replacement. Added `enterFolder`/`exitFolder` bridge actions and React folder list/back control (re-verified with focused unit + `build:react:workspace-panels`).
- Residual evidence gap (not a Background Library regression): `workspace-shell-panel-navigation.e2e.js` has pre-existing failures around Settings locator strict-mode (`.settings-page, #root`) and one legacy-hosted panel switch case; Background persistence E2E is green (3/3).
- No confirmed security findings in this slice: background path/filename guards remain server-side; React item actions go through existing rename/delete endpoints.
- Review follow-up (2026-07-17): fixed React selection to await the background service rather than act on hidden gallery nodes; added explicit global/chat upload targets; removed duplicate auto-selection and folder service calls; aligned the Backgrounds ledger entry with the service/barrel owner. Focused proof: `bun run --cwd tests test:unit -- background-library-service.test.js react-workspace-panels-helpers.test.js --runInBand`.
- UX walkthrough follow-up (2026-07-17): using a fresh temporary user session and screenshot inspection at desktop and 375px mobile, fixed React/legacy duplicate visible gallery scaffolding, restored visible thumbnail previews, localized the visible Background Library workflow, kept actions horizontally readable, and retained compact side-by-side mobile cards. Proof: `bun run build:react:workspace-panels`, `bun run --cwd tests test:unit -- background-library-service.test.js react-workspace-panels-helpers.test.js background-panel-controller.test.js --runInBand`, and `bun run test:compat`.
