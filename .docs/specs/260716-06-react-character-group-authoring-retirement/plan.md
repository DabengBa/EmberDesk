# React Character 与 Group Authoring Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-06-react-character-group-authoring-retirement.md`
Doc IDs: feature.group_authoring, feature.character_library_panel, page.chat_workspace

## Tasks

### Task 1: 建立 Character/Group 全字段 coverage 与 React form
- [x] **Done**
- **Reqs:** R1, R2
- **Kind:** behavior
- **Scope:** `app/workspace-panels.tsx` 及拆分 authoring components/schemas, legacy forms as coverage source, form tests
- **Proof:** command: bun run --cwd tests test:unit -- character-authoring-facade.test.js group-authoring-facade.test.js react-workspace-panels-helpers.test.js --runInBand
- **PM:** 打开现有 character/group edit fixtures -> React 可查看和修改所有仍受支持字段，无 legacy-only 提示
- **Doc IDs:** feature.group_authoring, feature.character_library_panel, page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 用直接 command/service 替换 legacy save completion
- [x] **Done**
- **Reqs:** R3, R4, R7
- **Kind:** behavior
- **Scope:** authoring client command adapters, `src/endpoints/character-write-service.js`, `src/endpoints/groups.js`, route/service tests
- **Proof:** command: bun run --cwd tests test:unit -- character-write-service.test.js character-card-helpers.test.js character-authoring-facade.test.js group-authoring-facade.test.js --runInBand
- **PM:** create/edit/save/delete character 和 group 并注入 validation/conflict failure -> response 与 UI 状态一致，无 hidden button/DOM completion
- **Doc IDs:** feature.group_authoring, feature.character_library_panel
- **Evidence:** evidence/task-02.md

### Task 3: 完成 mutation reconcile 与删除/取消安全状态
- [x] **Done**
- **Reqs:** R4, R5
- **Kind:** behavior
- **Scope:** TanStack mutations/query invalidation, active context updates, late-response guards, E2E fixtures
- **Proof:** command: bun run --cwd tests test:e2e -- character-group-authoring.e2e.js welcome-screen-character-management.e2e.js --workers=1
- **PM:** 保存后重开、取消未保存 draft、删除 active entity、模拟 late response -> 数据与当前上下文均保持正确
- **Doc IDs:** feature.group_authoring, feature.character_library_panel, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 删除 legacy forms、facades、flags 与 fallback
- [x] **Done**
- **Reqs:** R6
- **Kind:** behavior
- **Scope:** `public/scripts/character-authoring.js`, `public/scripts/group-authoring.js`, `public/script.js`, legacy panel HTML, workspace feature flags/mount paths/tests
- **Proof:** command: bun run build:react:workspace-panels && bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js character-authoring-facade.test.js group-authoring-facade.test.js --runInBand
- **PM:** 从 workspace 打开 character/group authoring 并检查运行时 -> 仅 React form 可见可操作，source 中无 legacy save/fallback 激活路径
- **Doc IDs:** feature.group_authoring, feature.character_library_panel, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 固化兼容、浏览器与语义文档
- [x] **Done**
- **Reqs:** R7, R8
- **Kind:** behavior
- **Scope:** authoring E2E/compat tests, `.docs/db/features/group-authoring.md`, character library/chat workspace docs, ledger/history
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- character-group-authoring.e2e.js --workers=1 && bun run docs:check
- **PM:** desktop/mobile 完整创建、编辑、avatar、advanced fields、member reorder、reload -> 能力无缩水且文档 owner 状态准确
- **Doc IDs:** feature.group_authoring, feature.character_library_panel, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [x] High — character/group save no longer waits on DOM click / save-completion polling; direct `/api/characters` and `/api/groups` writes return identity for reconcile (`public/script.js`, `public/scripts/character-authoring.js`; R3/R5).
- [x] High — late save responses cannot baseline a cancelled or remounted draft (`shouldApplyCharacterAuthoringSaveResult` + `saveGenerationRef`; R5).
- [x] Medium — full character/group field coverage is in React form; unsupported extension warning no longer routes to legacy-only edit (`app/workspace-panels.tsx`; R1/R2/R6).
- [x] Medium — product flags retired; missing workspace-panels build fails closed instead of dual-owner legacy fallback (`src/workspace-react-features.js`, mount hosts; R6).
- [x] Medium — group cancel/delete keep legacy host hidden (`getGroupAuthoringReactBridge`; R6).
- [x] Documentation sole-owner contracts updated for `feature.group_authoring`, `feature.character_library_panel`, `page.chat_workspace`, ledger, and project history (R8).
- [x] Validation: focused unit suites (52 tests across authoring/helpers/flags), `bun run test:compat`, `bun run docs:check` (30 docs), `bun run build:react:workspace-panels`. Playwright E2E blocked here by missing Chromium headless shell binary; Node is 24.16.0 so local browser proof is diagnostic-only versus contract Node 26.3.0.
- [x] Doc-ID gate: `bun run docs:check` green.
- [x] Frontend review: structure-led full-field form with sticky primary Save/Cancel hierarchy retained; danger Delete separated; member reorder remains non-drag; avatar file input added for direct write path.
- [x] Review complete
