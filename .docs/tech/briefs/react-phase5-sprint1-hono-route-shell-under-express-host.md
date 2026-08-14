---
created: 2026-06-23
source: user
confirmed: true
last_updated: 2026-06-23
---

# React Phase 5 Sprint 1 Hono Route Shell Under Express Host Intent (Historical)

> 本 brief 记录 2026-06-23 的已废弃实验。ADR-0013 已于 2026-08-07 删除 Hono route island 及其桥接层；当前后端路由直接使用 Express。

## User Original Request

用户先要求针对 React Phase 5 backend API 方向进行一次带联网检索的压力测试和文档收敛，不要直接沿用“Express 被 Hono 替换”的宽泛叙述，而是结合项目真实代码、约束和长期路线提出更严格的改进建议。

在此基础上，用户继续触发 `$delivery-workflow`，但当前 Phase 5 只有 phase-level 规划文档，没有可直接实施的 delivery-ready `spec.md`。随后用户显式触发 `$brainstorming`，要求把已批准方向收敛成一个真正可交付的首个 Sprint 规格。

## Background & Motivation

Phase 5 已经被重新定义为 “Typed API 与 backend boundary evaluation”，不是预设的后端框架替换。当前仓库中 `src/server-main.js` 和 `src/server-startup.js` 已经形成一条严格的 Express 宿主链：安全中间件、body parsing、CORS、auth/whitelist/host checks、session、CSRF、public routes、登录墙、uploads、私有路由、error handler 和最终 404 都有既有顺序与测试保护。

因此，当时 Phase 5 的第一个可交付切片被收敛为 route-island 实验，而不是后端框架迁移。该实验仅作为历史设计背景保留，不再是当前实现方向。

## Intent Domains

### Domain: Express 宿主下的首个 Hono route island proof（已被取代）

- **User expectation:** 当时先做一个最小、可验证、可回滚的 Hono route island 试点，证明 typed API 边界是否值得继续推进，而不是把整个 Express runtime owner 提前替换掉
- **Current status:** superseded by ADR-0013
- **Change history:**
  - 2026-06-23: 用户要求对 React Phase 5 backend API 方向做基于真实代码和联网资料的压力测试，并更新文档
  - 2026-06-23: Phase 5 规划文档当时被收敛为 “Express-hosted Hono route island / Drizzle decision gate / Express retention gate”
  - 2026-06-23: 用户继续触发 `$brainstorming`，要求补出 delivery-ready 的首个 Sprint spec
  - 2026-06-23: 默认首切被收敛为 `POST /api/moving-ui/save`，因为它只涉及单一 JSON body、单一目录写入和单一 cache invalidation side effect
  - 2026-06-23: 当时交付完成；该 route island 后由 ADR-0013 删除，`/save` 现在由直接的 Express router 拥有

### Domain: Phase 5 不提前膨胀成框架替换或数据层迁移（历史）

- **User expectation:** Phase 5 必须保持保守边界，避免把 Hono、Drizzle、Express sunset、canonical storage 改造混成一个 Sprint
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 用户要求改进 Phase 5 文档内容，确保建议建立在项目实际代码与长期路线图约束上
  - 2026-06-23: 当时的默认方案被明确为只验证 route island；Drizzle 进入 Sprint 2 decision gate，Express sunset 进入 Sprint 3 ADR gate
  - 2026-06-23: 交付完成；本 Sprint 只落地 `moving-ui/save`，没有扩大到 runtime replacement、Drizzle 或 canonical storage

## Implementation Traceability

- **Delivery status:** delivered and archived on 2026-06-23
- **Historical code path:** The former Hono route island and its focused parity test under `moving-ui` were removed by ADR-0013.
- **Current replacement path:** `src/endpoints/moving-ui.js`, `tests/moving-ui-express-route.test.js`
- **Durable decision path:** `.docs/adr/0008-hono-route-island-under-express-host.md`（已被取代）、`.docs/adr/0013-remove-obsolete-web-stack-experiments.md`、`.docs/tech/react-modernization-roadmap.md`、`.docs/PROJECT_HISTORY.md`
- **Commit / PR trace:** archived in the current Phase 5 wrap-up commit; durable history recorded in `.docs/PROJECT_HISTORY.md` dated 2026-06-23

## Non-Goals

- 本 Sprint 不替换 `server.js` / `src/server-main.js` / `src/server-startup.js` 的 Express runtime owner
- 本 Sprint 不迁移 `settings`、`characters`、`chats`、`groups`、`worldinfo`、`images`、`files`、`extensions`、`secrets`、provider backends、uploads 或 proxy 路由
- 本 Sprint 不引入 Drizzle，不改变 file-backed canonical storage
- 本 Sprint 不新增面向用户的设置项、灰度开关或语义层文案

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/briefs/react-modernization-intent.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `src/server-main.js`
- `src/server-startup.js`
- `src/endpoints/moving-ui.js`
- `src/endpoints/quick-replies.js`
- `src/endpoints/themes.js`
- `tests/express5-route-compatibility.test.js`
- https://hono.dev/docs/getting-started/nodejs
- https://hono.dev/docs/api/routing
- https://expressjs.com/en/guide/using-middleware.html
- https://expressjs.com/en/guide/migrating-5.html
