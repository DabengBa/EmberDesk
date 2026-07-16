# React World Info Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-08-react-world-info-retirement.md`
Doc IDs: feature.world_info_panel, page.chat_workspace

## Tasks

### Task 1: 抽出 World Info domain、repository 与 prompt services
- [x] **Done**
- **Reqs:** R2, R3, R4, R7
- **Kind:** behavior
- **Scope:** `public/scripts/world-info.js`, new focused World Info service modules, shell capability injection, existing unit tests
- **Proof:** command: bun run --cwd tests test:unit -- world-info-shell-context.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js --runInBand
- **PM:** 对同一 fixtures 执行 scan/prompt/import/delete/save -> service 输出与当前结果一致且不依赖 workbench DOM
- **Doc IDs:** feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 让 React workbench 直接拥有全部 World Info actions/state
- [x] **Done**
- **Reqs:** R1, R3, R4
- **Kind:** behavior
- **Scope:** `app/world-info-workbench.tsx`, TanStack queries/mutations/forms, World Info service client, focused React tests
- **Proof:** command: bun run --cwd tests test:unit -- world-info-card-rendering.test.js react-workspace-panels-helpers.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 完成 activation、book/entry CRUD、search/sort、advanced edit、import/export/error -> 无 raw DOM action，状态与持久结果一致
- **Doc IDs:** feature.world_info_panel
- **Evidence:** evidence/task-02.md

### Task 3: 保持 public imports/events 并收缩 compatibility barrel
- [x] **Done**
- **Reqs:** R2, R5, R7
- **Kind:** behavior
- **Scope:** `public/scripts/world-info.js`, `@sillytavern/*` alias resolution, prompt consumers, compat tests
- **Proof:** command: bun run test:compat && bun run --cwd tests test:unit -- world-info-shell-context.test.js --runInBand
- **PM:** 通过现有 public import 调用 converter/prompt/entry helpers -> exports 可用且 barrel 无 DOM/state owner
- **Doc IDs:** feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 删除 legacy editor DOM、adapter、flag 与 fallback
- [x] **Done**
- **Reqs:** R6
- **Kind:** behavior
- **Scope:** `public/panels/world-info-body.html`, `public/script.js`, legacy World Info DOM/CSS/handlers, workspace flags/mount paths/tests
- **Proof:** command: bun run build:react:workspace-panels && bun run --cwd tests test:unit -- world-info-card-rendering.test.js react-workspace-panels-helpers.test.js --runInBand
- **PM:** 打开 World Info 并检查 DOM/source -> 只有 React workbench，无 hidden adapter、flag 或 legacy fallback
- **Doc IDs:** feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 完成浏览器、兼容与语义文档验证
- [x] **Done**
- **Reqs:** R3, R4, R8
- **Kind:** behavior
- **Scope:** World Info E2E/compat fixtures, `.docs/db/features/world-info-panel.md`, Chat Workspace docs, ledger/history
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- world-info-workbench.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1 && bun run docs:check
- **PM:** desktop/mobile、locked drawer、import conflicts、delete cascade、prompt/regex fixture -> 行为完整且文档为 sole owner
- **Doc IDs:** feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [x] Review complete

### Findings
- Zero confirmed high-severity defects.

### Residual risks
- `public/panels/world-info-body.html` and Select2-backed global activation/settings controls remain as hidden/inert compatibility hosts under React sole-owner. Product flag-off no longer restores the legacy editor; full body/handler deletion is residual cleanup once activation-rules UI is React-owned.
- `public/scripts/world-info.js` still contains legacy card/import UI code paths used by slash commands and non-React consumers; pure projection and workbench selection state are service-owned, but the file is not yet a pure re-export barrel.
- Workspace shell navigation E2E has two pre-existing Settings/AI Config handoff failures unrelated to World Info sole-owner (AI Config `aria-pressed`, Settings locator strict-mode). World Info workbench E2E 3/3 green.

### Validation re-run
- `node --check` on `public/script.js`, `world-info.js`, domain, and workbench service: PASS
- `bun run --cwd tests test:unit -- world-info-domain-service.test.js world-info-shell-context.test.js world-info-card-rendering.test.js --runInBand` PASS (30)
- `bun run test:compat` PASS (12)
- `bun run docs:check` PASS (30 docs)
- `bun run build:react:workspace-panels` PASS
- `bun run --cwd tests test:e2e -- world-info-workbench.e2e.js --workers=1` PASS (3)
- Frontend review: sole-owner workbench already covered by World Info E2E + unit sole-owner structural tests; no additional design-system rewrite in scope.
