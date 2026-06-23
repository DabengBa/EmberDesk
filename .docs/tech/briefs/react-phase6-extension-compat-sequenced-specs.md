---
created: 2026-06-23
source: user-request
confirmed: true
last_updated: 2026-06-23
---

# React Phase 6 Extension Compatibility Sequenced Specs

## User Original Request

用户要求对 Phase 6 扩展兼容阶段使用 `$brainstorming`，扩展为多个 specs 开发文档。

## Background & Motivation

Phase 6 当前只有 `.docs/specs/react-phase6-extension-compat/README.md` 级别的 phase 说明，还没有拆成可审批、可交付、可被 Phase 7 直接消费的实现规格。路线图已经把 Phase 6 定义为证据和维护阶段，要求在进入 Phase 7 Sprint 4 与 Sprint 7 之前补齐 common-extension validation、迁移说明、弃用窗口、回滚方案和 breaking-change review，但现有材料还停留在总述层，缺少逐项完成定义。用户随后进一步明确：Phase 6 的首要目标不是泛化地“照顾所有扩展”，而是优先确保 `JS-Slash-Runner` 的兼容；其他扩展只作为次级证据面。

## Intent Domains

### Domain 1: Compatibility contract ledger baseline

- **User expectation:** 先把 Phase 6 涉及的 protected surfaces、当前 owner、fallback 归属、测试护栏和 Phase 7 消费关系固定成一份可审计台账，并额外标明它们是否为 `JS-Slash-Runner` 的直接依赖，再拆后续证据 spec。
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 创建本 brief，作为 Phase 6 多 spec 收敛的上游意图。
  - 2026-06-23: 用户明确 `JS-Slash-Runner` 是 Phase 6 的 primary compatibility gate，合同台账必须先标出哪些 surface 是它的直接依赖。
  - 2026-06-23: dated spec `260623-01-phase6-contract-ledger` 已完成 delivery、review 和文档同步。
- **Implementation traceability:** process artifacts `.docs/specs/260623-01-phase6-contract-ledger/spec.md`, `.docs/specs/260623-01-phase6-contract-ledger/plan.md`; durable docs `.docs/tech/third-party-extension-compatibility.md`, `.docs/specs/react-phase6-extension-compat/README.md`, `.docs/tech/react-modernization-roadmap.md`; proof `bun run test:compat`, `bun run docs:check`; commit `this wrap-up commit`; delivery status `delivered JS-Slash-Runner-prioritized Phase 6 contract ledger`

### Domain 2: Extension runtime compatibility evidence

- **User expectation:** Phase 6 需要把 `JS-Slash-Runner` 设为 primary compatibility gate；regex、Quick Reply-style event usage、Extensions Manager flow 和 protected mount-point lifecycle 仅在它们能证明或影响 `JS-Slash-Runner` 兼容时进入高优先级证据，而不是作为并列主目标。
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 创建本 brief，作为 Phase 6 扩展运行时兼容证据 spec 的上游意图。
  - 2026-06-23: 用户明确次级扩展只作为补充证据，不能与 `JS-Slash-Runner` 并列为主目标。
  - 2026-06-23: dated spec `260623-02-phase6-extension-runtime-compatibility-evidence` 已完成 delivery、review 和文档同步。
- **Implementation traceability:** process artifacts `.docs/specs/260623-02-phase6-extension-runtime-compatibility-evidence/spec.md`, `.docs/specs/260623-02-phase6-extension-runtime-compatibility-evidence/plan.md`; durable docs `.docs/tech/third-party-extension-compatibility.md`, `.docs/specs/react-phase6-extension-compat/README.md`; external validation `https://gitlab.com/novi028/JS-Slash-Runner` checked on 2026-06-23 with current dependency evidence at `src/index.ts` (`#tavern_helper` -> `#extensions_settings`), `src/function/slash.ts` (`executeSlashCommandsWithOptions`), `src/function/generate/utils.ts`, and `src/function/tavern_regex.ts` (`getRegexedString` / `regex_placement`), plus current `@sillytavern/*` and `eventSource` / `event_types` consumers across `src/`; proof `bun run test:compat`, `bun run docs:check`; commit `this wrap-up commit`; delivery status `delivered JS-Slash-Runner-first runtime evidence and blocker rules`

### Domain 3: Global export and bridge evidence

- **User expectation:** `globalThis.SillyTavern`、`eventSource`、`event_types` 与 allowlisted React compatibility bridge 需要有单独的证据 spec，但其优先顺序应以 `JS-Slash-Runner` 是否直接消费这些 globals 为判断标准。
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 创建本 brief，作为 Phase 6 全局导出与 bridge 证据 spec 的上游意图。
  - 2026-06-23: 用户确认 globals/bridge 证据的优先级由 `JS-Slash-Runner` 的直接消费关系决定，而不是先抽象成通用 React bridge API。
  - 2026-06-23: dated spec `260623-03-phase6-global-compatibility-evidence` 已完成 delivery、review 和文档同步。
- **Implementation traceability:** process artifacts `.docs/specs/260623-03-phase6-global-compatibility-evidence/spec.md`, `.docs/specs/260623-03-phase6-global-compatibility-evidence/plan.md`; code `app/compat/global-compatibility-bridge.js`; durable docs `.docs/tech/third-party-extension-compatibility.md`, `.docs/specs/react-phase6-extension-compat/README.md`, `.docs/project-overview.md`; proof `bun run test:compat`, `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand`, `bun run docs:check`; commit `this wrap-up commit`; delivery status `delivered public-global versus internal-bridge evidence with JS-Slash-Runner priority`

### Domain 4: Migration, deprecation, and rollback package

- **User expectation:** Phase 6 不能只说“后续要有 migration guide / deprecation warning / rollback plan”，而要把这些产物本身写成一个可执行 spec，作为 Phase 7 决策门前置输入；任何 breaking candidate 只要会破坏 `JS-Slash-Runner` 兼容且没有替代路径，就不得进入 Phase 7 删除路径。
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 创建本 brief，作为 Phase 6 迁移/弃用/回滚包 spec 的上游意图。
  - 2026-06-23: 用户确认任何会破坏 `JS-Slash-Runner` 且没有替代路径、迁移说明和回滚方案的 candidate，都不得进入 Phase 7 删除路径。
  - 2026-06-23: dated spec `260623-04-phase6-migration-deprecation-rollback-package` 已完成 delivery、review 和文档同步。
- **Implementation traceability:** process artifacts `.docs/specs/260623-04-phase6-migration-deprecation-rollback-package/spec.md`, `.docs/specs/260623-04-phase6-migration-deprecation-rollback-package/plan.md`; durable docs `.docs/tech/third-party-extension-compatibility.md`, `.docs/specs/react-phase6-extension-compat/README.md`, `.docs/tech/react-modernization-roadmap.md`, `.docs/PROJECT_HISTORY.md`; proof `bun run docs:check`; commit `this wrap-up commit`; delivery status `delivered Phase 7 input package with JS-Slash-Runner hard gate`

## Non-Goals

- 不在 brainstorming 阶段实现代码、测试或生产文档落地。
- 不把 Phase 7 的删除、冻结或长期支持决策提前到 Phase 6。
- 不把 Express/Hono、Drizzle、main-chat transport 或 renderer cutover 混入本次 Phase 6 spec 集。
- 不新增与现有 protected surfaces 无关的扩展 API、抽象层或配置开关。

## Source Evidence

- `.docs/specs/react-phase6-extension-compat/README.md`
- `.docs/specs/260623-01-phase6-contract-ledger/spec.md`
- `.docs/specs/260623-01-phase6-contract-ledger/plan.md`
- `.docs/specs/260623-02-phase6-extension-runtime-compatibility-evidence/spec.md`
- `.docs/specs/260623-02-phase6-extension-runtime-compatibility-evidence/plan.md`
- `.docs/specs/260623-03-phase6-global-compatibility-evidence/spec.md`
- `.docs/specs/260623-03-phase6-global-compatibility-evidence/plan.md`
- `.docs/specs/260623-04-phase6-migration-deprecation-rollback-package/spec.md`
- `.docs/specs/260623-04-phase6-migration-deprecation-rollback-package/plan.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/project-overview.md`
- `.docs/PROJECT_HISTORY.md`
- `tests/global-compatibility-bridge.test.js`
- `tests/third-party-extension-compatibility.test.js`
- `https://gitlab.com/novi028/JS-Slash-Runner`
