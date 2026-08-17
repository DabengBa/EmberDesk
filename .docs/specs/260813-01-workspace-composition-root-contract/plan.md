# Workspace Composition Root Contract Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260813-01-workspace-composition-root-contract.md`
Delivery topic: 冻结 Composition Root 契约并切断最高频反向依赖
Doc IDs: term.shared_browser_library, feature.startup_bootstrap, page.chat_workspace

## Tasks

### Task 1: 建立 Composition Root 契约和导出清单
- [x] **Done**
- **Reqs:** R1, R2, R3
- **Kind:** non-behavior
- **Scope:** ADR-0014, public/scripts/** 反向导入清单, 静态 allowlist 测试
- **Proof:** command: pnpm run test:compat
- **PM:** 运行静态测试 -> 输出具体 forbid 的导入和 allowlist 条目
- **Doc IDs:** term.shared_browser_library, feature.startup_bootstrap
- **Evidence:** evidence/task-01.md

### Task 2: 切断 events.js 反向依赖
- [x] **Done**
- **Reqs:** R1, R2
- **Kind:** behavior
- **Scope:** public/scripts/** 模块改 import from events.js, 删除旧 import
- **Proof:** command: pnpm run test:compat + focused unit tests
- **PM:** 运行 test:compat -> 确认 events 契约覆盖 -> 所有模块不再从 script.js 导入 eventSource/event_types
- **Doc IDs:** term.shared_browser_library
- **Evidence:** evidence/task-02.md

### Task 3: 切断 request-context 和 public-api
- [x] **Done**
- **Reqs:** R1, R2
- **Kind:** behavior
- **Scope:** request-context.js (CSRF token, getRequestHeaders, ajax prefilter), public-api.js (SillyTavern install), script.js re-export
- **Proof:** command: pnpm run test:compat + unit tests for CSRF header shape and install timing
- **PM:** 运行 test:compat -> 确认 request-headers/public API 契约覆盖 -> 所有模块不再从 script.js 导入 getRequestHeaders
- **Doc IDs:** term.shared_browser_library, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 清理和文档更新
- [x] **Done**
- **Reqs:** R4, R5, R6
- **Kind:** non-behavior
- **Scope:** 删除旧实现, 更新 tests, 文档
- **Proof:** command: pnpm run test:compat
- **PM:** 运行兼容门和静态契约 -> 确认已抽出的旧实现已删除、批准 re-export/bootstrap 仍存在；未迁移领域 owner 保留，回滚路径为 PR revert
- **Doc IDs:** term.shared_browser_library, feature.startup_bootstrap
- **Evidence:** evidence/task-04.md

## Review

- [x] Review complete

### Resolved Findings

- [x] Review: R-01 import specifiers and recursive first-party scan were repaired and verified (severity: P0; scope: Tasks 1-2; proof: `node --check` over `public/script.js` and recursive `public/scripts/**/*.js`, direct Jest compatibility suites).
- [x] Review: event and request-header ownership was cut over to `events.js` and `request-context.js` (severity: P1; scope: Tasks 2-3; proof: zero forbidden import hits and 22 focused compatibility tests).
- [x] Review: public API installation no longer references root-local performance hooks (severity: P1; scope: Task 3; proof: `public-api.js` accepts only `libs`/`getContext`, direct runtime test).
- [x] Review: reverse-import gate now uses a fixed recursive allowlist and exact equality (severity: P1; scope: Task 1; proof: actual importer set equals the 70-entry allowlist).
- [x] Review: startup now uses `bootstrapWorkspace()` and has no `firstLoadInit` residue (severity: P1; scope: Task 4; proof: static startup contract test and source scan).
- [x] Review: CSRF request context preserved the pre-token `undefined` header shape after extraction (severity: P1; scope: Task 3; proof: red test failed on `null`, green test passes after `let token` repair).
- [x] Review: CSRF fetch failures retain the original propagation path to the startup owner instead of being swallowed in the extracted module (severity: P1; scope: Task 3; proof: focused rejection test and source comparison with the pre-extraction outer startup catch).
- [x] Review: focused runtime proof was added to `test:compat` and covers headers, prefilter, public API install timing, and bootstrap (severity: P2; scope: Tasks 3-4; proof: root `test:compat` script includes both compatibility suites).
- [x] Review: evidence and ADR/spec wording now distinguish the frozen boundary from later domain/DOM/React extraction (severity: P2; scope: Task 4; proof: updated ADR, brief, spec, and task evidence).
- [x] Review: proof records now match the executable commands and final test inventory (severity: P2; scope: Tasks 1-4; proof: `pnpm run test:compat` passes 2 suites/22 tests, including 10 composition-root tests; syntax and semantic-doc checks pass).
- [x] Review: contract fixture strings now satisfy the tests package lint rule (severity: P2; scope: Task 1; proof: targeted tests ESLint failed on 8 quote violations before the fix and passes after the fix).

### Scope Notes

- Character Authoring export wiring, Character Library row geometry, and other unrelated dirty-worktree changes were not attributed to this topic and were not modified during review.
- The remaining `public/scripts/** -> script.js` imports are the explicit compatibility allowlist; this wave does not claim zero reverse imports or an assembly-only 17k-line root.
- Frontend review was scoped to static startup/compatibility impact: this topic adds no DOM/layout/CTA/primary-flow change, so no UX walkthrough was required.
- Local validation used Node `v24.16.0` before it became the supported baseline; it remains historical diagnostic evidence, not current release proof for this runtime-contract change.
- Root ESLint could not load the repository configuration for the extracted browser modules (`@typescript-eslint/typescript-estree` failed while reading `Cjs`); the tests-package ESLint, compatibility tests, syntax checks, semantic docs, and workflow gates passed. This is an environment/toolchain evidence gap, not a confirmed topic defect.
