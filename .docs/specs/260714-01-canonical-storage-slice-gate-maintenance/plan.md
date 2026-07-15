# Canonical Storage Slice Gate Maintenance Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260714-01-canonical-storage-slice-gate-maintenance.md`
Doc IDs: none

## Tasks

### Task 1: 先固定现有 fallback 与独立 override 行为
- [x] **Done**
- **Reqs:** R1, R2, R6
- **Kind:** behavior
- **Scope:** storage flag resolver tests, existing slice flag snapshots
- **Proof:** command: bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-rollout-contract.test.js --runInBand
- **PM:** 用缺失 override、显式 true/false、非法配置生成 effective flag snapshot -> 旧 slice 保持 fallback，非法配置 fail closed
- **Doc IDs:** none
- **Evidence:** evidence/task-01.md

### Task 2: 实现 registry-driven gate 与 operator 可观测性
- [x] **Done**
- **Reqs:** R2, R3, R5, R6
- **Kind:** behavior
- **Scope:** `src/storage-feature-flags.js`, registry, operator, focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js --runInBand
- **PM:** 查询 multi-slice status -> 每个 slice 显示 effective value、来源和独立 blocker
- **Doc IDs:** none
- **Evidence:** evidence/task-02.md

### Task 3: 去除 domain tests 的最终 migration 版本耦合
- [x] **Done**
- **Reqs:** R4
- **Kind:** non-behavior
- **Scope:** canonical migration/store tests and shared assertions
- **Proof:** command: bun run --cwd tests test:unit -- canonical-sqlite-migrations.test.js canonical-settings-store.test.js canonical-secrets-store.test.js canonical-managed-media-store.test.js --runInBand
- **PM:** 增加一个无关测试 migration fixture -> settings/secrets domain assertions 仍按所需 schema 通过
- **Doc IDs:** none
- **Evidence:** evidence/task-03.md

## Review

- [x] Review: R-01 Disabled global-fallback slices left stale audits clean (severity: high; scope: canonical audit invalidation; details: evidence/review.md#r-01)
- [x] Review: R-02 Malformed slice override containers inherited global gates (severity: high; scope: slice resolver; details: evidence/review.md#r-02)
- [x] Review: R-03 Slice configuration documentation contradicted current descriptor keys (severity: medium; scope: technical documentation; details: evidence/review.md#r-03)
- [x] Review complete
- **Evidence:** evidence/review.md
