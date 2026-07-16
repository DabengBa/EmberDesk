# React Character Library Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-05-react-character-library-retirement.md`
Doc IDs: feature.character_library_panel, page.chat_workspace

## Tasks

### Task 1: 让 React 独立拥有 list query、filter、sort 与 compatible rows
- [x] **Done**
- **Reqs:** R1, R2, R5
- **Kind:** behavior
- **Scope:** `app/character-library-panel.tsx`, `app/components/character-library/*`, `app/lib/character-library-helpers.ts`, character query helpers/tests
- **Proof:** command: bun run --cwd tests test:unit -- character-library-react-helpers.test.js character-list-structure.test.js character-read-service.test.js --runInBand && bun run test:compat
- **PM:** 从 welcome/workspace 打开角色库并搜索、排序、tag filter、选择 character/group -> 行为正确且保护 selectors/identity 均存在
- **Doc IDs:** feature.character_library_panel, page.chat_workspace
- **Evidence:** `.docs/specs/260716-05-react-character-library-retirement/evidence/task-01.md`

### Task 2: 将 selection、bulk、dialogs 与 mutation reconcile 迁入 React
- [x] **Done**
- **Reqs:** R3, R4
- **Kind:** behavior
- **Scope:** React Character Library state/actions, delete/import invalidation, dialog components, focused state tests
- **Proof:** command: bun run --cwd tests test:unit -- character-list-state.test.js character-list-render-state.test.js character-list-structure.test.js --runInBand
- **PM:** 执行单选、键盘、bulk tag/delete、取消/确认并注入 late snapshot -> UI 与持久结果一致，删除项不复活
- **Doc IDs:** feature.character_library_panel
- **Evidence:** `.docs/specs/260716-05-react-character-library-retirement/evidence/task-02.md`

### Task 3: 删除 legacy renderer、host、sync、flag 与 fallback
- [x] **Done**
- **Reqs:** R6
- **Kind:** behavior
- **Scope:** `public/script.js`, `public/scripts/character-library-react-sync.js`, `app/components/character-library/LegacyElementHost.tsx`, `src/react-character-library-feature.js`, workspace feature payload/config/tests
- **Proof:** command: bun run build:react:character-library && bun run --cwd tests test:unit -- character-library-react-panel-flag.test.js react-workspace-panels-helpers.test.js character-list-structure.test.js --runInBand
- **PM:** 检查 flag/build-missing 路径和 workspace 打开流程 -> 仅 React owner，可用发布产物中不存在 legacy list fallback
- **Doc IDs:** feature.character_library_panel, page.chat_workspace
- **Evidence:** `.docs/specs/260716-05-react-character-library-retirement/evidence/task-03.md`

### Task 4: 固化浏览器、兼容、性能与文档证明
- [x] **Done**
- **Reqs:** R5, R7, R8
- **Kind:** behavior
- **Scope:** character E2E/performance/compat tests, `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`, ledger/history
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- welcome-screen-character-management.e2e.js character-group-authoring.e2e.js --workers=1 && bun run perf:interaction && bun run docs:check
- **PM:** 在 desktop/mobile 与大列表 fixture 完成浏览、筛选、选择、bulk、删除 -> 无功能缩水、selectors 可用、交互时间未明显退化
- **Doc IDs:** feature.character_library_panel, page.chat_workspace
- **Evidence:** `.docs/specs/260716-05-react-character-library-retirement/evidence/task-04.md`

## Review

- [x] Review complete
