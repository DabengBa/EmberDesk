# World Info 工作台内容与结构重构 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-01-world-info-workbench-restructure.md`
Doc IDs: feature.world_info_panel, page.chat_workspace

## Tasks

### Task 1: 修正抽屉 containment，并建立单一可见 owner 与回退边界
- [x] **Done**
- **Reqs:** R1, R4, R7
- **Kind:** behavior
- **Scope:** `public/index.html`, `public/css/world-info.css`, `public/script.js`, `public/panels/world-info-body.html`, World Info host mount/failure path, focused structure and browser fixtures
- **Proof:** command: bun run --cwd tests test:unit -- world-info-card-rendering.test.js react-workspace-panels-helpers.test.js --runInBand && bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js world-info-workbench.e2e.js --workers=1
- **PM:** 在 flag-on desktop/mobile 打开 World Info，再分别关闭 panel flag 或模拟 bundle failure -> flag-on 仅一个可见且可聚焦 workbench，移动端 entry editor 可达；回退时 legacy drawer 完整可用
- **Doc IDs:** feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 以 World Info facade 建立受限的 workbench snapshot/action seam
- [x] **Done**
- **Reqs:** R2, R3, R6, R7
- **Kind:** behavior
- **Scope:** `public/scripts/world-info.js`, `public/scripts/world-info-shell-context.js`, `public/script.js`, existing workspace bridge state, `tests/world-info-shell-context.test.js`, `tests/world-info-import-feedback.test.js`, `tests/world-info-converters.test.js`, `tests/worldinfo-delete-cascade.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- world-info-shell-context.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js react-workspace-panels-helpers.test.js --runInBand && bun run test:compat
- **PM:** 选择 global worlds、选择 editor book、创建/导入/导出/刷新/删除并触发一条 entry -> React 状态与 legacy 结果一致，global/editor 互不串改，import/error 后可恢复且不发生 raw DOM action bypass
- **Doc IDs:** feature.world_info_panel
- **Evidence:** evidence/task-02.md

### Task 3: 交付桌面分栏与移动双状态的 React World Info workbench
- [x] **Done**
- **Reqs:** R2, R3, R4, R5, R6, R8
- **Kind:** behavior
- **Scope:** `app/workspace-panels.tsx` 或其拆分的 World Info React components/styles, workspace panel state helpers, `public/locales/zh-cn.json`, React panel unit tests, new `tests/world-info-workbench.e2e.js`
- **Proof:** command: bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js world-info-card-rendering.test.js --runInBand && bun run build:react:workspace-panels && bun run --cwd tests test:e2e -- world-info-workbench.e2e.js --workers=1
- **PM:** 在 desktop 选择 book、筛选/排序、打开并编辑 entry；在 mobile 从列表进入编辑再返回 -> 一个 header、一份列表、一位 editor，非默认高级字段有摘要，焦点和列表位置恢复，新增中文 UI 无内部枚举
- **Doc IDs:** feature.world_info_panel
- **Evidence:** evidence/task-03.md

### Task 4: 固化兼容、无损字段和锁定抽屉的端到端回归门
- [x] **Done**
- **Reqs:** R1, R4, R5, R6, R7, R8
- **Kind:** behavior
- **Scope:** `tests/world-info-card-rendering.test.js`, `tests/world-info-converters.test.js`, `tests/worldinfo-delete-cascade.test.js`, `tests/third-party-extension-compatibility.test.js`, `tests/workspace-shell-panel-navigation.e2e.js`, `tests/world-info-workbench.e2e.js`, compatibility fixtures
- **Proof:** command: bun run --cwd tests test:unit -- world-info-card-rendering.test.js world-info-shell-context.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js react-workspace-panels-helpers.test.js third-party-extension-compatibility.test.js --runInBand && bun run test:compat && bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js world-info-workbench.e2e.js --workers=1
- **PM:** 导入带 `vectorized` 的 legacy book、保存无关字段、锁定 Character Management 后打开 World Info、走 import cancellation/error 与 bundle fallback -> 兼容字段未丢、两个 drawer 可用、所有失败路径有恢复且 legacy facade 仍是唯一业务 owner
- **Doc IDs:** feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 更新用户可见语义文档并完成 Doc ID 验证
- [x] **Done**
- **Reqs:** R9
- **Kind:** non-behavior
- **Scope:** `.docs/db/features/world-info-panel.md`, `.docs/db/pages/chat-workspace.md`, related durable technical docs only when implementation changes their stated boundary, spec/brief indexes
- **Proof:** command: bun run docs:check
- **PM:** 审阅 World Info 与 Chat Workspace 的 owning docs -> 明确单一可见 owner、全局/编辑分离、移动 list/editor、locked drawer 并存和 fallback，Doc ID 链接完整
- **Doc IDs:** feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [x] Review complete
- [x] Review: R-01 Desktop list/editor collapsed when mobileView shared (severity: high; scope: task-03/workbench; details: evidence/review.md#R-01)
- [x] Review: R-02 Activation rules entry lacked real secondary surface (severity: medium; scope: task-03/global; details: evidence/review.md#R-02)
- [x] Review: R-03 Dead vectorized no-op in field update path (severity: low; scope: task-02/facade; details: evidence/review.md#R-03)

### Frontend review
- touches_frontend: true (classify_changes.py)
- Desktop split remains visible after entry select; mobile uses matchMedia + list/editor states
- Activation rules reveal legacy global panel only under React owner
- Rebuild: `bun run build:react:workspace-panels` PASS
- Unit recheck: world-info-card-rendering + react-workspace-panels-helpers PASS


### Post-delivery multi-surface re-review (2026-07-16)
- [x] Review: R-04 React list ignored search/sort facade pipeline (severity: high; scope: task-02/list; evidence: public/scripts/world-info.js getWorldInfoWorkbenchEntrySummaries; proof: unit helpers + filter/sort markers)
- [x] Review: R-05 Field blur remount stole editor focus (severity: high; scope: task-02/bridge; evidence: public/script.js shouldRemount; proof: unit marker + rebuild)
- [x] Review: R-06 Activation rules reveal re-exposed global multi-select dual owner (severity: medium; scope: task-01/global; evidence: hideLegacyWorldInfoWorkbench WIMultiSelector hide; proof: unit card-rendering markers)
- [x] Review: R-07 Mixed EN advanced labels vs Chinese workbench claim (severity: medium; scope: task-03/i18n; evidence: app/world-info-workbench.tsx + position labels; proof: build:react:workspace-panels)
- Doc ID gate: `bun run docs:check` green (30 docs); no ID rename/topology island introduced by this re-review.
- Residual gap: full Playwright ST e2e for workbench still environment-dependent; structure/unit/build/docs revalidated after fixes.

### Residual gaps
- Full Playwright ST browser proof for workbench e2e not executed in this run (environment-dependent); unit/structure/build/docs gates are green.
