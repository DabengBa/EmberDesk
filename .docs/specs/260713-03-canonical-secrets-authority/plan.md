# Canonical Secrets Authority Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-03-canonical-secrets-authority.md`
Doc IDs: page.api_configuration

## Tasks

### Task 1: 建立 secret schema、安全 shadow import 与 audit
- [ ] **Done**
- **Reqs:** R1, R3
- **Kind:** behavior
- **Scope:** canonical migrations, secret store/import/audit, `tests/canonical-secrets-store.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-secrets-store.test.js secrets-migration.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 导入 flat/array fixtures 并运行 audit -> IDs/active 状态稳定，报告不含 canary secret
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-01.md

### Task 2: 将 SecretManager 切换为 DB-first backend
- [ ] **Done**
- **Reqs:** R2, R4, R7
- **Kind:** behavior
- **Scope:** `src/endpoints/secrets.js`, SecretManager backend seam, provider/secret tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-secrets-store.test.js secrets-input-map.test.js provider-secret-field-state.test.js --runInBand
- **PM:** 在 API Configuration 新增、重命名、切换、删除 secrets -> masked/active/label 与当前 UI 一致且每 key 仅一个 active
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-02.md

### Task 3: 实现 projection repair、rollback 与泄露扫描
- [ ] **Done**
- **Reqs:** R3, R5, R6
- **Kind:** behavior
- **Scope:** secret projection/operator path, rollout gates, security-focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-secrets-store.test.js canonical-sqlite-operator.test.js secrets-migration.test.js --runInBand
- **PM:** 模拟 `secrets.json` 投影失败 -> DB 保持权威、operator 仅显示净化 blocker、rollback 被阻断
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-03.md

### Task 4: 更新安全与用户流程文档
- [ ] **Done**
- **Reqs:** R3, R6, R7
- **Kind:** non-behavior
- **Scope:** `.docs/db/pages/api-configuration.md`, `.docs/tech/provider-secret-field-state.md`, roadmap/history/logic docs
- **Proof:** command: bun run docs:check
- **PM:** 阅读 API Configuration 与 secret tech docs -> 明确 SQLite 非加密、masking/exposure/rollback 边界
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-04.md

## Review

- [ ] Review complete
