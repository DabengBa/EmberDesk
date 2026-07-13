# Canonical Settings Document Authority Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-02-canonical-settings-document-authority.md`
Doc IDs: page.settings

## Tasks

### Task 1: 建立 settings schema、shadow import 与 audit
- [x] **Done**
- **Reqs:** R1
- **Kind:** behavior
- **Scope:** canonical migrations, settings store/import/audit service, `tests/canonical-settings-store.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-settings-store.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 对同一 `settings.json` 连续导入并制造 DB/file drift -> 导入幂等且 audit 给出确定分类
- **Doc IDs:** page.settings
- **Evidence:** evidence/task-01.md

### Task 2: 切换 DB-first read 并保持 payload/startup parity
- [x] **Done**
- **Reqs:** R2, R7
- **Kind:** behavior
- **Scope:** `src/endpoints/settings.js`, settings read service, startup/frontend focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-settings-store.test.js settings-get-route.test.js settings-cache.test.js settings-react-route.test.js --runInBand
- **PM:** 开启 read flag 加载 React Settings 与 legacy drawer -> 字段、目录聚合和加载事件顺序不变
- **Doc IDs:** page.settings
- **Evidence:** evidence/task-02.md

### Task 3: 实现 revision write、projection 与 repair
- [x] **Done**
- **Reqs:** R3, R4
- **Kind:** behavior
- **Scope:** settings write service/route, projection repairs, operator tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-settings-store.test.js canonical-sqlite-operator.test.js settings-react-route.test.js --runInBand
- **PM:** 两个会话用同一 revision 保存 -> 第一个成功，第二个得到 conflict；模拟文件投影失败 -> DB revision 保留且出现 repair blocker
- **Doc IDs:** page.settings
- **Evidence:** evidence/task-03.md

### Task 4: 迁移 snapshots、rollback 与文档
- [x] **Done**
- **Reqs:** R5, R6, R7
- **Kind:** behavior
- **Scope:** settings snapshot routes/helpers, rollback gates, `.docs/db/pages/settings.md`, roadmap/logic docs
- **Proof:** command: bun run --cwd tests test:unit -- canonical-settings-store.test.js settings-get-route.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js --runInBand && bun run docs:check
- **PM:** 创建并恢复 snapshot -> 内容恢复为新 revision；存在 open repair 时 rollback 被阻断
- **Doc IDs:** page.settings
- **Evidence:** evidence/task-04.md

## Review

- [x] Review complete
- Notes: evidence/review.md — zero confirmed fix-required findings; residual legacy no-revision LWW accepted; frontend-review N/A for material UI.
