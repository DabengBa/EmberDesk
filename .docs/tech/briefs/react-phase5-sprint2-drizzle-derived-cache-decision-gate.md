---
created: 2026-06-23
source: user
confirmed: true
last_updated: 2026-06-23
---

# React Phase 5 Sprint 2 Drizzle Derived-Cache Decision Gate Intent

## User Original Request

用户追问：根据当前 roadmap，只补出一个 Sprint 1 spec 是否足以完成 Phase 5；如果不足，要求继续补充足够的 Phase 5 spec，使后续可以按 roadmap 继续开发，而不是停留在 phase-level 说明。

## Background & Motivation

Phase 5 在当前路线图中被明确定义为三段式后端边界评估：

1. Express 宿主下的 Hono route island 试点
2. Drizzle derived-cache decision gate
3. Express retention / sunset ADR gate

Sprint 1 只能回答 “typed route island 是否可行”。它不能替代 Sprint 2，因为仓库当前唯一成熟的 SQLite 切片是 derived cache，而不是 canonical storage；是否值得把 Drizzle 引入这一层，必须单独基于现有 `node:sqlite` helper、character index、fallback、自愈和性能证据来做决策。

## Intent Domains

### Domain: 只围绕现有 SQLite derived cache 决定 Drizzle 是否值得引入

- **User expectation:** Sprint 2 需要形成一个真正可执行的 decision gate，明确回答“是否值得在 derived-cache slice 上引入 Drizzle”，而不是把 Drizzle 当作路线图上的默认已采用技术
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 用户要求补齐足够的 Phase 5 spec，而不只是 Sprint 1
  - 2026-06-23: 本次将 Sprint 2 收敛为基于 `character-index.sqlite` 和 `derived-cache-sqlite` 的单切片决策门
  - 2026-06-23: 交付完成；ADR-0009 明确记录当前不采用 Drizzle，继续保留 handwritten `node:sqlite` helper

### Domain: file-backed canonical storage 不被借机偷渡到 ORM

- **User expectation:** Sprint 2 不能把 derived cache 评估写成数据库正本迁移的前奏，也不能混入 `DiskCache`、聊天正本、角色正本、settings/secrets 等非 SQLite 或 canonical surface
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 通过现有代码核对，`character-index.sqlite` 是当前唯一值得纳入 Drizzle 评估的 SQLite sidecar；`DiskCache` 不是 SQLite，不纳入本 Sprint
  - 2026-06-23: 交付完成；路线图、derived-cache tech doc 和 interaction-performance tech doc 都已同步到 rejection 结论

## Implementation Traceability

- **Delivery status:** delivered and archived on 2026-06-23
- **Code path:** `src/derived-cache-sqlite.js`, `src/endpoints/character-index.js`, `src/endpoints/character-read-service.js`, `tests/derived-cache-sqlite.test.js`, `tests/character-read-service.test.js`, `tests/interaction-performance-index.test.js`
- **Durable decision path:** `.docs/adr/0009-derived-cache-sqlite-drizzle-decision.md`, `.docs/tech/derived-cache-sqlite.md`, `.docs/tech/interaction-performance-indexing.md`, `.docs/PROJECT_HISTORY.md`
- **Commit / PR trace:** archived in the current Phase 5 wrap-up commit; durable history recorded in `.docs/PROJECT_HISTORY.md` dated 2026-06-23

## Non-Goals

- 本 Sprint 不把 SQLite 变成 canonical storage
- 本 Sprint 不迁移 `data/<user>/characters/*.png`、`data/<user>/chats/**`、settings、secrets、world info、extensions 或 provider 状态到 Drizzle
- 本 Sprint 不把 `DiskCache` 纳入 Drizzle gate
- 本 Sprint 不因为评估 Drizzle 就改写现有 `/api/characters/all|list|get` 的 HTTP 契约

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/project-overview.md`
- `.docs/tech/derived-cache-sqlite.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/PROJECT_HISTORY.md`
- `src/derived-cache-sqlite.js`
- `src/endpoints/character-index.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/characters.js`
- `tests/derived-cache-sqlite.test.js`
- `tests/interaction-performance-index.test.js`
- `tests/character-read-service.test.js`
- https://orm.drizzle.team/docs/get-started/sqlite-new
- https://orm.drizzle.team/docs/migrations
- https://nodejs.org/api/sqlite.html
