# Built-in Vector Retirement Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260715-01-built-in-vector-retirement.md`
Doc IDs: feature.extension_panel_open, feature.world_info_panel, page.chat_workspace

## Tasks

### Task 1: 服务端不再加载或执行第一方向量实现
- [x] **Done**
- **Reqs:** R2, R3, R4, R8
- **Kind:** behavior
- **Scope:** `src/server-startup.js`, vector tombstone router, `src/endpoints/vectors.js`, `src/vectors/`, `src/transformers.js`, vector-only model routes, config migration/defaults, `package.json`, `bun.lock`, user-directory compatibility tests
- **Proof:** command: bun run --cwd tests test:unit -- vector-retirement.test.js express5-route-compatibility.test.js --runInBand
- **PM:** 在含旧 vector fixture 的用户目录启动服务并请求 `/api/vector/query` 与未知 vector path -> 返回 `410` JSON，fixture 未改变，服务无 `vectra` 依赖仍可启动
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: Workspace 和 World Info 不再承诺第一方向量能力
- [x] **Done**
- **Reqs:** R1, R5, R6
- **Kind:** behavior
- **Scope:** `public/scripts/extensions/vectors/`, `public/index.html`, World Info state selector/converters, prompt compatibility fields, itemization templates, extension discovery and focused frontend tests
- **Proof:** command: bun run --cwd tests test:unit -- vector-retirement.test.js world-info-converters.test.js --runInBand && bun run test:compat
- **PM:** 打开 Extensions 和带旧 `vectorized: true` entry 的 World Info -> 无 Vector Storage/Vectorized 操作入口，编辑并导出后兼容字段不丢失，其他扩展正常加载
- **Doc IDs:** feature.extension_panel_open, feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: Data Bank 附件与退役失败边界通过真实浏览器验证
- [x] **Done**
- **Reqs:** R2, R6, R7, R8
- **Kind:** behavior
- **Scope:** Data Bank attachment UI and slash commands, vector-only command removal, browser fixtures, cache-stale legacy API behavior
- **Proof:** command: bun run --cwd tests test:e2e -- vector-retirement.e2e.js
- **PM:** 在真实 workspace 完成 Data Bank 附件添加/查看/禁用/启用/删除并模拟旧 vector 请求 -> 附件流程成功、vector 命令不可用、旧请求稳定 `410`
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: Durable docs 关闭 vector hardening 路线
- [x] **Done**
- **Reqs:** R9
- **Kind:** non-behavior
- **Scope:** `.docs/project-overview.md`, `.docs/PROJECT_HISTORY.md`, `.docs/tech/canonical-sqlite-storage-roadmap.md`, `.docs/tech/third-party-extension-compatibility.md`, `.docs/db/features/extension-panel-open.md`, `.docs/db/features/world-info-panel.md`, `.docs/db/pages/chat-workspace.md`, brief/spec indexes
- **Proof:** command: bun run docs:check
- **PM:** 检查 owning docs 和 spec/brief 索引 -> 不再把 vector hardening 列为 active work，明确旧索引保留、第一方能力退役、Data Bank 与兼容字段继续存在
- **Doc IDs:** feature.extension_panel_open, feature.world_info_panel, page.chat_workspace
- **Evidence:** evidence/task-04.md

## Review

- [x] Review complete
