# React Settings Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-07-react-settings-retirement.md`
Doc IDs: page.settings, page.api_configuration, page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider

## Tasks

### Task 1: 建立完整 settings owner inventory 与无损 bindings
- [x] **Done**
- **Reqs:** R1, R3, R4
- **Kind:** behavior
- **Scope:** `app/lib/settings-helpers.js`, current legacy setting sources, coverage tests
- **Proof:** command: bun run --cwd tests test:unit -- settings-react-route.test.js settings-get-route.test.js canonical-settings-store.test.js --runInBand
- **PM:** 加载包含旧枚举、未知字段和各 owner domain 的 fixture，修改单字段保存 -> 仅该字段改变，其余完整 round-trip
- **Doc IDs:** page.settings, page.api_configuration, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider
- **Evidence:** evidence/task-01.md

### Task 2: 补齐 provider、connection 与 secret workflows
- [x] **Done**
- **Reqs:** R2, R4, R5
- **Kind:** behavior
- **Scope:** `app/routes/settings.tsx`, settings provider components, secret helpers/endpoints, provider tests
- **Proof:** command: bun run --cwd tests test:unit -- settings-react-route.test.js secrets-input-map.test.js canonical-settings-store.test.js --runInBand
- **PM:** 配置 provider、profile、Vertex/service account、fallback 和 secrets 并保存/清除/触发错误 -> 结果与现有 contract 一致且 secret 不进入 JSON
- **Doc IDs:** page.settings, page.api_configuration, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider
- **Evidence:** evidence/task-02.md

### Task 3: 补齐 UI、formatting 与 advanced settings 并验证即时应用
- [x] **Done**
- **Reqs:** R1, R3, R5
- **Kind:** behavior
- **Scope:** settings React components/tabs, theme/formatting/power-user bindings, workspace apply/reload integration
- **Proof:** command: bun run --cwd tests test:unit -- settings-react-route.test.js --runInBand && bun run build:react
- **PM:** 修改 theme/UI/formatting/prompt/reasoning/streaming/STscript settings -> 保存后 workspace 与刷新后结果一致
- **Doc IDs:** page.settings, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 删除 Settings flags、fallback drawers 与 legacy handlers
- [x] **Done**
- **Reqs:** R6, R7
- **Kind:** behavior
- **Scope:** `src/users.js`, `src/react-settings-feature.js`, `public/index.html`, `public/script.js`, settings drawer modules/styles, workspace navigation/tests
- **Proof:** command: bun run --cwd tests test:unit -- settings-react-route.test.js react-workspace-panels-helpers.test.js --runInBand && bun run build:react
- **PM:** 从 URL 和 workspace navigation 打开 Settings 并模拟 build missing -> 正常只进入 React，缺 build 明确失败，无 legacy drawer
- **Doc IDs:** page.settings, page.api_configuration, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 完成 E2E、冲突、可访问性与语义文档证明
- [x] **Done**
- **Reqs:** R4, R5, R8
- **Kind:** behavior
- **Scope:** `tests/settings.e2e.js`, route/unit coverage, `.docs/db/pages/settings.md`, API Configuration/Chat Workspace docs, ledger/history
- **Proof:** command: bun run --cwd tests test:e2e -- settings.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1 && bun run docs:check
- **PM:** desktop/mobile 完成各 domain 编辑、secret、409 conflict、error/retry、reload -> 功能完整且文档不再描述 fallback
- **Doc IDs:** page.settings, page.api_configuration, page.chat_workspace, feature.chat_completion_select, feature.custom_base_url, feature.fallback_provider
- **Evidence:** evidence/task-05.md

## Review

- [x] Review complete

### Findings
- [x] Review: R-01 string numeric enums blocked form save validation (severity: high; scope: task-1/3; fixed: coerce in buildSettingsFormDefaults + z.coerce on key fields)
- [x] Review: R-02 Vertex service-account deferred to legacy drawer (severity: high; scope: task-2; fixed: full mode uses vertexai_service_account_json secrets path)
- [x] Review: R-03 settings flag fallback to workspace (severity: high; scope: task-4; fixed: sole-owner 503 missing-build, shell always navigates /settings)
- [x] Review: R-04 sparse settings save materialized every missing default (severity: high; scope: task-1; fixed: compare form values with the loaded baseline and write only changed bindings, while retaining the Vertex source dependency mapping; proof: settings-react-route.test.js)
- [x] Review: R-05 revision conflict discarded the local draft (severity: high; scope: task-5; fixed: retain the draft, disable save, and require explicit reload before merge/retry; proof: settings.e2e.js)
- [x] Review: R-06 connection profile only persisted an ID and did not apply the existing profile workflow (severity: high; scope: task-2; fixed: named profile selector plus one-time workspace marker consumed by Connection Manager's existing application path; proof: settings-react-route.test.js)
- [x] Review: R-07 direct legacy top-bar drawer toggles still opened Settings/API/Formatting forms outside the React shell (severity: high; scope: task-4; fixed: capture-phase route handoff to /settings tabs while retaining compatibility hosts; proof: settings-react-route.test.js)
- [x] Review: R-08 roadmap referenced a non-committed retirement brief (severity: medium; scope: documentation; fixed: durable ADR-0012 and legacy-cutover-ledger references only; proof: docs:check/docs:build)

### Residual risks
- Legacy drawer DOM hosts remain in `public/index.html` for compatibility, but their direct Settings/API/Formatting toggles now route to React Settings.
- This environment uses Node.js 24.16.0; the project release-runtime contract is Node.js 26.3.0, so the local runtime checks are diagnostic rather than release proof.

### Validation re-run
- TDD red: `settings-react-route.test.js` failed before the sparse-save, Vertex-default, profile, conflict, and direct-drawer fixes.
- `bun run --cwd tests test:unit -- settings-react-route.test.js settings-get-route.test.js canonical-settings-store.test.js secrets-input-map.test.js provider-secret-field-state.test.js --runInBand` PASS (38); Jest reported the project's existing post-result async-handle warning and was stopped after results.
- `bun run --cwd tests test:e2e -- settings.e2e.js --workers=1` PASS (3).
- `bun run build:react` PASS.
- `bun run test:compat` PASS (12).
- `bun run docs:check && bun run docs:build` PASS; topology contains 30 nodes and 236 edges with no explicit orphan/island report.
