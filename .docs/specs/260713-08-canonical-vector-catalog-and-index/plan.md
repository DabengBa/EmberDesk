# Canonical Vector Catalog And Derived Index Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-08-canonical-vector-catalog-and-index.md`
Doc IDs: feature.extension_panel_open, page.chat_workspace

## Tasks

### Task 1: 建立 collection/source/chunk/build schema 与 source adapters
- [ ] **Done**
- **Reqs:** R1, R2, R3
- **Kind:** behavior
- **Scope:** canonical migrations, vector catalog/source adapters, `tests/canonical-vector-catalog.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-vector-catalog.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 从 canonical chat/World Info/media fixtures 重建两次 -> source/chunk IDs 稳定，provider/model change 产生新 build identity
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 实现 derived index build、publish 与 recovery
- [ ] **Done**
- **Reqs:** R4, R5
- **Kind:** behavior
- **Scope:** vector build coordinator, Vectra adapter, `tests/canonical-vector-index.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-vector-catalog.test.js canonical-vector-index.test.js --runInBand
- **PM:** 模拟 partial provider failure 与删除 index -> incomplete build 不发布、上一 complete build 可查、删除后可从 catalog 重建
- **Doc IDs:** feature.extension_panel_open
- **Evidence:** evidence/task-02.md

### Task 3: 切换 vector endpoints、invalidation 与 purge
- [ ] **Done**
- **Reqs:** R6, R7
- **Kind:** behavior
- **Scope:** `src/endpoints/vectors.js`, source invalidation hooks, endpoint/compat tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-vector-catalog.test.js canonical-vector-index.test.js --runInBand && bun run test:compat
- **PM:** 通过 extension vectors UI query/insert/delete/purge，并删除 canonical source -> payload 兼容且 stale result 消失，purge 不删除源数据
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 完成 rollback、operator 与文档
- [ ] **Done**
- **Reqs:** R4, R8
- **Kind:** behavior
- **Scope:** vector operator/rebuild/rollback gates, semantic/tech/logic docs
- **Proof:** command: bun run --cwd tests test:unit -- canonical-vector-catalog.test.js canonical-vector-index.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js --runInBand && bun run docs:check
- **PM:** 查询 build/operator 状态并尝试 rollback -> index/catalog 对齐时允许，incomplete/stale build 时阻断并给出 rebuild 路径
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-04.md

## Review

- [ ] Review complete
