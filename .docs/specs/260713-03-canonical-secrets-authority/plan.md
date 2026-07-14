# Canonical Secrets Authority Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-03-canonical-secrets-authority.md`
Doc IDs: page.api_configuration

## Tasks

### Task 1: 建立 secret schema、安全 shadow import 与 audit
- [x] **Done**
- **Reqs:** R1, R3
- **Kind:** behavior
- **Scope:** canonical migrations, secret store/import/audit, `tests/canonical-secrets-store.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-secrets-store.test.js secrets-migration.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 导入 flat/array fixtures 并运行 audit -> IDs/active 状态稳定，报告不含 canary secret
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-01.md

### Task 2: 将 SecretManager 切换为 DB-first backend
- [x] **Done**
- **Reqs:** R2, R4, R7
- **Kind:** behavior
- **Scope:** `src/endpoints/secrets.js`, SecretManager backend seam, provider/secret tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-secrets-store.test.js secrets-input-map.test.js provider-secret-field-state.test.js --runInBand
- **PM:** 在 API Configuration 新增、重命名、切换、删除 secrets -> masked/active/label 与当前 UI 一致且每 key 仅一个 active
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-02.md

### Task 3: 实现 projection repair、rollback 与泄露扫描
- [x] **Done**
- **Reqs:** R3, R5, R6
- **Kind:** behavior
- **Scope:** secret projection/operator path, rollout gates, security-focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-secrets-store.test.js canonical-sqlite-operator.test.js secrets-migration.test.js --runInBand
- **PM:** 模拟 `secrets.json` 投影失败 -> DB 保持权威、operator 仅显示净化 blocker、rollback 被阻断
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-03.md

### Task 4: 更新安全与用户流程文档
- [x] **Done**
- **Reqs:** R3, R6, R7
- **Kind:** non-behavior
- **Scope:** `.docs/db/pages/api-configuration.md`, `.docs/tech/provider-secret-field-state.md`, roadmap/history/logic docs
- **Proof:** command: bun run docs:check
- **PM:** 阅读 API Configuration 与 secret tech docs -> 明确 SQLite 非加密、masking/exposure/rollback 边界
- **Doc IDs:** page.api_configuration
- **Evidence:** evidence/task-04.md

## Review

- [x] Review: R-01 补齐 secrets CLI 的净化输出回归 (severity: low; scope: Task 3 CLI proof; evidence: `tests/canonical-sqlite-cli.test.js`; proof: `bun run --cwd tests test:unit -- canonical-sqlite-cli.test.js --runInBand --forceExit`)
- [x] Review: R-02 投影 repair 未关闭时 read flag 不得回退旧文件 (severity: high; scope: canonical authority/rollback; evidence: `src/canonical-secrets-backend.js`; proof: `canonical-secrets-store.test.js`)
- [x] Review: R-03 重复 secret record ID 必须产生净化的 blocking import/audit 结果 (severity: medium; scope: shadow import compatibility; evidence: `src/canonical-secrets-shadow-import.js`; proof: `canonical-secrets-store.test.js`)
- [x] Review: R-04 指定不存在的 secret repair key 必须返回失败而非静默成功 (severity: medium; scope: operator CLI; evidence: `src/canonical-sqlite-operator.js`; proof: `canonical-sqlite-cli.test.js`)
- [x] Review: R-05 API Configuration 初次加载必须显示已保存状态并提供当前 provider 的凭据历史入口 (severity: medium; scope: post-delivery UX correction authorized by user; evidence: `public/index.html`, `public/scripts/openai.js`; proof: `secrets-input-map.test.js`, desktop screenshots `desktop-13-fixed-initial-saved-manager.png` and `desktop-14-key-manager-one-key.png`)
- [x] Review: R-06 provider 切换后密钥管理器不得沿用 jQuery 缓存的旧 key (severity: high; scope: provider secret ownership; evidence: `public/scripts/openai.js`; proof: fail/pass `secrets-input-map.test.js`, browser repro `mobile-08-provider-switch-opens-stale-key.png`, browser fix `mobile-09-provider-switch-fixed.png`)
- [x] Doc ID gate: `bun run docs:build` passed; topology 30 nodes / 236 edges, no orphan nodes; `page.api_configuration` remains connected.
- [x] Frontend contract review: the post-delivery UX walkthrough added a direct-mode entry to the existing key manager, kept it hidden for proxy and Vertex Service Account modes, synchronized provider/secret events, localized its accessible name, and updated `page.api_configuration` plus provider-state docs. Desktop and 375x812 mobile paths preserve masked values and keep add/rename/delete confirmations reachable.
- [x] Review complete
