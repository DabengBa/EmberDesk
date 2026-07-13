# Canonical Storage Control Plane Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-01-canonical-storage-control-plane.md`
Doc IDs: none

## Tasks

### Task 1: 注册并隔离 canonical storage slices
- [x] **Done**
- **Reqs:** R1, R2, R6
- **Kind:** behavior
- **Scope:** `src/canonical-sqlite-rollout-contract.js`, new registry helper, `tests/canonical-storage-slice-registry.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-rollout-contract.test.js --runInBand
- **PM:** 运行 focused tests -> 重复 key、缺能力和跨 slice blocker 均得到确定结果
- **Doc IDs:** none
- **Evidence:** evidence/task-01.md

### Task 2: 统一 operator 状态、audit 与 repair 调度
- [x] **Done**
- **Reqs:** R2, R3, R4
- **Kind:** behavior
- **Scope:** `src/canonical-sqlite-operator.js`, `scripts/canonical-sqlite-audit.mjs`, `scripts/canonical-sqlite-repair.mjs`, operator/CLI tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-sqlite-operator.test.js canonical-sqlite-cli.test.js --runInBand
- **PM:** 对测试用户查询 all-slice status -> 每个 slice 独立显示 readiness、audit、repair 与 rollback blocker，输出不含用户内容
- **Doc IDs:** none
- **Evidence:** evidence/task-02.md

### Task 3: 将 character 与 World Info 接入通用合同
- [x] **Done**
- **Reqs:** R4, R6
- **Kind:** behavior
- **Scope:** character/World Info rollout adapters and focused regression tests
- **Proof:** command: bun run --cwd tests test:unit -- character-read-service.test.js character-write-service.test.js canonical-world-info-store.test.js worldinfo-route-service.test.js canonical-sqlite-rollout-contract.test.js --runInBand
- **PM:** 分别制造 character 与 World Info drift -> 只阻断对应 slice，既有 fallback/strict 行为保持
- **Doc IDs:** none
- **Evidence:** evidence/task-03.md

### Task 4: 建立 backup/restore readiness 与文档合同
- [x] **Done**
- **Reqs:** R3, R5
- **Kind:** behavior
- **Scope:** canonical operator backup manifest/readiness helpers, tests, `.docs/tech/canonical-sqlite-storage-roadmap.md`, logic docs
- **Proof:** command: bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-operator.test.js --runInBand && bun run docs:check
- **PM:** 查询完整与缺失 managed-file manifest 的备份状态 -> 分别显示 ready 与 blocker，不自动改写数据
- **Doc IDs:** none
- **Evidence:** evidence/task-04.md

## Review

- [x] Review complete

### Review notes
- Full focused suite: 8 suites / 77 tests passed.
- `classify_changes.py` flagged frontend/user-surface from whole dirty worktree; this feature itself is operator/backend-only with no browser UI change. Frontend review skipped with boundary note.
- Complexity fix applied: removed redundant full-control-plane backup readiness recompute inside per-slice status summary; top-level `backupRestore` remains the authority.
- No confirmed high-risk correctness, security, or isolation regressions after revalidation.
