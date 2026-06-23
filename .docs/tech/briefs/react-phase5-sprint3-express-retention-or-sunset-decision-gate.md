---
created: 2026-06-23
source: user
confirmed: true
last_updated: 2026-06-23
---

# React Phase 5 Sprint 3 Express Retention Or Sunset Decision Gate Intent

## User Original Request

用户继续要求：既然 Sprint 1 不能单独完成 Phase 5，就应按 roadmap 补齐剩余开发 spec，而不是把 “Express 是否保留为 runtime owner” 留成未排期的含糊后话。

## Background & Motivation

当前仓库的 Express 宿主边界已经非常具体：`server-main.js` 负责启动编排与中间件链，`server-startup.js` 负责 transport/listen，`plugin-loader.js` 负责 `/api/plugins/{id}` 挂载，`tests/express5-route-compatibility.test.js` 已把 redirect、private gate、uploads、plugin mounting、error/404、static MIME 等行为提升成生产契约。

因此，Phase 5 的最后一段不能写成“未来再看是否 sunset Express”。它必须形成一个明确的 ADR gate：要么记录继续保留 Express 为 runtime owner 的理由和阻塞条件，要么非常审慎地列出后续才允许讨论 sunset 的前置证据。默认结论不应是 sunset。

## Intent Domains

### Domain: 把 Express runtime owner 结论写成 ADR 决策，而不是暗示性路线图句子

- **User expectation:** Sprint 3 必须落成一个可执行的决策规格，最终产出 ADR，明确 Express 是继续保留还是仅在满足前置门后才允许讨论 sunset
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 用户要求补齐足够的 Phase 5 spec
  - 2026-06-23: 本次将 Sprint 3 收敛为 Express retention / sunset ADR gate，而不是运行时代码 cutover
  - 2026-06-23: 交付完成；ADR-0010 明确记录继续保留 Express 为 backend runtime owner

### Domain: 把宿主中间件链、plugin mount、uploads、proxy、error/404、startup owner 都视为一等约束

- **User expectation:** Sprint 3 不能只看 route syntax 或 typed API；所有真实宿主职责都必须进决策面，否则所谓 sunset 结论没有意义
- **Current status:** delivered
- **Change history:**
  - 2026-06-23: 通过现有代码与技术文档核对，Express 宿主边界已覆盖 public/private fan-out、deprecated redirects、plugin mounting、uploads、proxy、error handler、final 404、startup transport 分工
  - 2026-06-23: 交付完成；startup/plugin tech docs、roadmap 和 project history 已同步到 retention 结论

## Implementation Traceability

- **Delivery status:** delivered and archived on 2026-06-23
- **Code path:** `src/server-main.js`, `src/server-startup.js`, `src/plugin-loader.js`, `tests/express5-route-compatibility.test.js`, `tests/plugin-loader.test.js`, `tests/server-startup-profiler.test.js`, `tests/startup-critical-path.test.js`, `tests/startup-deferred-tasks.test.js`, `tests/startup-loader.test.js`
- **Durable decision path:** `.docs/adr/0010-express-runtime-owner-boundary.md`, `.docs/tech/server-startup-orchestration.md`, `.docs/tech/plugin-loader-lifecycle.md`, `.docs/PROJECT_HISTORY.md`
- **Commit / PR trace:** archived in the current Phase 5 wrap-up commit; durable history recorded in `.docs/PROJECT_HISTORY.md` dated 2026-06-23

## Non-Goals

- 本 Sprint 不删除 Express
- 本 Sprint 不把 Hono 提升为顶层 server
- 本 Sprint 不变更中间件顺序、static/public hosting、plugin 协议、canonical storage 或前端 React 路线
- 本 Sprint 不把“React workspace shell full owner cutover”与“backend runtime owner 决策”混成一个阶段

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/server-startup-orchestration.md`
- `.docs/tech/plugin-loader-lifecycle.md`
- `.docs/project-overview.md`
- `.docs/PROJECT_HISTORY.md`
- `src/server-main.js`
- `src/server-startup.js`
- `src/plugin-loader.js`
- `tests/express5-route-compatibility.test.js`
- `tests/plugin-loader.test.js`
- https://expressjs.com/en/guide/using-middleware.html
- https://expressjs.com/en/guide/migrating-5.html
