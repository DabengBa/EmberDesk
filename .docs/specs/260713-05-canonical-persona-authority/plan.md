# Canonical Persona Authority Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-05-canonical-persona-authority.md`
Doc IDs: page.chat_workspace

## Tasks

### Task 1: 建立 persona schema、settings import 与 audit
- [ ] **Done**
- **Reqs:** R1, R4
- **Kind:** behavior
- **Scope:** canonical migrations, persona store/import/audit, `tests/canonical-persona-store.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-persona-store.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 导入含 default/connections/missing avatar/chat lock 的 fixture -> IDs 稳定且各类 drift 被区分，不改写 chat
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 实现 settings compose/decompose 与 DB-first reads
- [ ] **Done**
- **Reqs:** R2, R5
- **Kind:** behavior
- **Scope:** settings canonical adapter, persona read path, startup/frontend tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-persona-store.test.js settings-get-route.test.js settings-react-route.test.js --runInBand
- **PM:** 开启 persona read flag 后加载 workspace/settings -> persona 列表、描述、default、connections、macro 输入与兼容 payload 不变
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 切换 persona mutations 与 projection repair
- [ ] **Done**
- **Reqs:** R3, R4, R6
- **Kind:** behavior
- **Scope:** persona command/write facade, settings projection, operator repair, focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-persona-store.test.js canonical-sqlite-operator.test.js chat-state-reset.test.js --runInBand
- **PM:** 执行 create/update/default/connect/delete 并模拟 settings projection failure -> DB 约束成立、chat lock 未被静默改写、repair 可见
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 完成兼容、rollback 与文档
- [ ] **Done**
- **Reqs:** R5, R7
- **Kind:** behavior
- **Scope:** compatibility gates, rollback contract, `.docs/db/pages/chat-workspace.md`, roadmap/logic docs
- **Proof:** command: bun run test:compat && bun run --cwd tests test:unit -- canonical-persona-store.test.js canonical-sqlite-rollout-contract.test.js --runInBand && bun run docs:check
- **PM:** flag off 与 clean rollback 后 reload personas -> selection/macros/events/URLs 可用；有 dangling reference 时 rollback 被阻断
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-04.md

## Review

- [ ] Review complete
