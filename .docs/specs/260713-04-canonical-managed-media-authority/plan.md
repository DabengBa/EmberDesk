# Canonical Managed Media Authority Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-04-canonical-managed-media-authority.md`
Doc IDs: feature.background_library_panel, page.chat_workspace

## Tasks

### Task 1: 建立 managed blob schema、catalog import 与 audit
- [x] **Done**
- **Reqs:** R1, R2, R4
- **Kind:** behavior
- **Scope:** canonical migrations, media catalog/import/audit, `tests/canonical-managed-media-store.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-managed-media-store.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 审计现有 backgrounds/assets/avatar/attachments fixtures -> 分类 registered/orphan/missing/hash mismatch 且不移动文件
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 切换 background 与 asset DB-first reads
- [x] **Done**
- **Reqs:** R4, R5
- **Kind:** behavior
- **Scope:** `src/endpoints/backgrounds.js`, `src/endpoints/assets.js`, media resolver, frontend/thumbnail tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-managed-media-store.test.js background-panel-controller.test.js thumbnail-lazy-image-loading.test.js thumbnail-cache-headers.test.js --runInBand
- **PM:** 开启 read flag 浏览 backgrounds folders 与 assets -> URL、排序、folder membership 和 thumbnail 行为兼容
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 实现受管 upload/import/rename/delete 与 repair
- [x] **Done**
- **Reqs:** R3, R5, R6
- **Kind:** behavior
- **Scope:** media write coordinator, endpoint mutations, repair/GC operator, focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-managed-media-store.test.js canonical-sqlite-operator.test.js thumbnail-write-time-pregeneration.test.js thumbnail-placeholder-background.test.js --runInBand
- **PM:** 模拟文件放置失败和被引用删除 -> 分别产生 repair blocker 与拒绝/tombstone；GC dry-run 不删除未审计文件
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 完成 rollback、兼容与语义文档
- [x] **Done**
- **Reqs:** R5, R7
- **Kind:** behavior
- **Scope:** rollout gates, compatibility tests, owning semantic/tech/logic docs
- **Proof:** command: bun run test:compat && bun run --cwd tests test:unit -- canonical-managed-media-store.test.js canonical-sqlite-rollout-contract.test.js --runInBand && bun run docs:check
- **PM:** flag off 与 audit-clean rollback 后重载背景、avatar 和 attachment -> 兼容 URL 可用；open repair 时 rollback 被阻断
- **Doc IDs:** feature.background_library_panel, page.chat_workspace
- **Evidence:** evidence/task-04.md

## Review

- [x] Review: R-01 Background folder mutations bypassed canonical authority (severity: high; scope: Task 2/3 folder ownership; evidence: `src/endpoints/image-metadata.js`; proof: `canonical-managed-media-write-service.test.js`, `canonical-managed-media-route-service.test.js`)
- [x] Doc ID gate: `bun run docs:check` and `bun run docs:build` passed; topology has 30 nodes and 236 edges, no isolated nodes, with `feature.background_library_panel` degree 8 and `page.chat_workspace` degree 72.
- [x] Frontend contract review: `public/scripts/backgrounds.js` retains the existing folder endpoints, request bodies, and response shapes. Route proof covers canonical folder create/assign followed by `/api/backgrounds/folders` reload; no browser UI source changed in this feature.
- [x] Review complete
