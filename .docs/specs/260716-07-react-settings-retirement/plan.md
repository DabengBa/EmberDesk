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

### Residual risks
- Playwright browser host instability prevented full green E2E re-run after conflict-case tuning; unit + docs + build green. Re-run `settings.e2e.js` and `workspace-shell-panel-navigation.e2e.js` on a machine with matching Playwright chromium.
- Legacy drawer DOM hosts remain in `public/index.html` for compatibility; not product entry points.

### Validation re-run
- settings-react-route.test.js PASS (9)
- docs:check PASS
- build:react PASS
