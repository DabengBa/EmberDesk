# Derived Vector Index Hardening Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260714-06-derived-vector-index-hardening.md`
Doc IDs: feature.extension_panel_open, page.chat_workspace

## Tasks

### Task 1: 固定 source/build identity 与 invalidation
- [ ] **Done**
- **Reqs:** R1, R2, R5, R8
- **Kind:** behavior
- **Scope:** source adapters, build identity helpers, invalidation tests
- **Proof:** command: bun run --cwd tests test:unit -- derived-vector-index-hardening.test.js --runInBand
- **PM:** 改变 source revision、model 和 chunk policy -> 只影响对应 build，identity 不依赖文件 rename
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 实现 generation staging、atomic publish 与 fallback
- [ ] **Done**
- **Reqs:** R3, R4, R6
- **Kind:** behavior
- **Scope:** vector generation manager, manifests, corruption/rebuild tests
- **Proof:** command: bun run --cwd tests test:unit -- derived-vector-index-hardening.test.js canonical-sqlite-operator.test.js --runInBand
- **PM:** 中断 build、损坏 current、删除全部 derived state -> partial 不可见、last complete 可用、全量可重建
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 保持 endpoint/UI compatibility 并完成文档
- [ ] **Done**
- **Reqs:** R5, R7, R8
- **Kind:** behavior
- **Scope:** vector endpoints, extension vectors UI, compatibility/semantic/tech docs
- **Proof:** command: bun run test:compat && bun run docs:check
- **PM:** 在现有 vectors UI 执行 query/insert/delete/purge 与 rebuild/fallback -> 操作兼容且 purge 后 canonical sources 完整
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-03.md

## Review

- [ ] Review complete
