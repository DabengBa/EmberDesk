---
created: 2026-06-23
source: user
confirmed: true
last_updated: 2026-06-23
---

# React Phase 5 Sprint 1 Hono Route Shell Under Express Host Intent

## User Original Request

用户先要求针对 `.docs/specs/react-phase5-backend-api` 进行一次带联网检索的压力测试和文档收敛，不要直接沿用“Express 被 Hono 替换”的宽泛叙述，而是结合项目真实代码、约束和长期路线提出更严格的改进建议。

在此基础上，用户继续触发 `$delivery-workflow`，但当前 Phase 5 只有 phase-level 规划文档，没有可直接实施的 delivery-ready `spec.md`。随后用户显式触发 `$brainstorming`，要求把已批准方向收敛成一个真正可交付的首个 Sprint 规格。

## Background & Motivation

Phase 5 已经被重新定义为 “Typed API 与 backend boundary evaluation”，不是预设的后端框架替换。当前仓库中 `src/server-main.js` 和 `src/server-startup.js` 已经形成一条严格的 Express 宿主链：安全中间件、body parsing、CORS、auth/whitelist/host checks、session、CSRF、public routes、登录墙、uploads、私有路由、error handler 和最终 404 都有既有顺序与测试保护。

因此，Phase 5 的第一个可交付切片不能以 “迁移后端框架” 为目标，而应先回答一个更窄的问题：在不破坏现有宿主链、不改用户可见语义、不触碰高风险路由族的前提下，是否可以用一个很小的 Hono route island 证明 typed route contract 的收益和可回归性。

## Intent Domains

### Domain: Express 宿主下的首个 Hono route island proof

- **User expectation:** 先做一个真正最小、可验证、可回滚的 Hono route island 试点，证明 typed API 边界是否值得继续推进，而不是把整个 Express runtime owner 提前替换掉
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 用户要求对 `.docs/specs/react-phase5-backend-api` 做基于真实代码和联网资料的压力测试，并更新文档
  - 2026-06-23: Phase 5 规划文档被收敛为 “Express-hosted Hono route island / Drizzle decision gate / Express retention gate”
  - 2026-06-23: 用户继续触发 `$brainstorming`，要求补出 delivery-ready 的首个 Sprint spec
  - 2026-06-23: 默认首切被收敛为 `POST /api/moving-ui/save`，因为它只涉及单一 JSON body、单一目录写入和单一 cache invalidation side effect
  - 2026-06-23: 交付完成；`src/endpoints/moving-ui.js` 现在由 Express 宿主下的 `movingUiRouteOwner` 拥有 `/save` 路由，见 ADR-0008 与 PROJECT_HISTORY

### Domain: Phase 5 不提前膨胀成框架替换或数据层迁移

- **User expectation:** Phase 5 必须保持保守边界，避免把 Hono、Drizzle、Express sunset、canonical storage 改造混成一个 Sprint
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 用户要求改进 Phase 5 文档内容，确保建议建立在项目实际代码与长期路线图约束上
  - 2026-06-23: 当前默认方案被明确为只验证 route island；Drizzle 进入 Sprint 2 decision gate，Express sunset 进入 Sprint 3 ADR gate
  - 2026-06-23: 交付完成；本 Sprint 只落地 `moving-ui/save`，没有扩大到 runtime replacement、Drizzle 或 canonical storage

## Implementation Traceability

- **Delivery status:** delivered and archived on 2026-06-23
- **Code path:** `src/endpoints/moving-ui.js`, `tests/moving-ui-hono-route-island.test.js`
- **Durable decision path:** `.docs/adr/0008-hono-route-island-under-express-host.md`, `.docs/tech/react-modernization-roadmap.md`, `.docs/PROJECT_HISTORY.md`
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
