---
created: 2026-06-30
source: user
confirmed: true
---

# Chat Import Service Coordinator Intent

## Original Request

用户要求针对“最值得推进的现代化切口”进一步细分步骤，并使用 `$brainstorming` 编写多份开发设计规格。本 brief 对应切口三：“后端路由继续 service 化”。

## Context

`src/endpoints/chats.js` 已经有 chat import converters、backup helpers 和 search/recent route service。下一步应继续 route-adjacent service 化，但保留 Express router、请求/响应 shape、JSONL 文件正本、导入格式兼容和 character-index dirty marking。

## Intent Domains

### Domain: chat import coordinator service

- User expectation: 降低 `/api/chats/import` 路由复杂度，让外部格式转换、目标文件命名、写入计划和错误分类可被单元测试覆盖。
- Recommended first slice: 新增或扩展 route-adjacent coordinator，复用现有 `chat-import-converters`，路由仍负责 Express request/response 与 upload cleanup。
- Current status: spec drafted, awaiting approval.
- Change history:
  - 2026-06-30: 记录用户要求的 5 个现代化 successor specs，并选择本切口的最小可交付边界。
  - 2026-06-30: `$grill-with-docs` 复核后强调 Express 5 async error 行为不得改变当前 `{ error: true }` response contract，并把 upload cleanup owner 作为上线阻塞风险写入 spec。

## Constraints

- 不改变 `/api/chats/import` HTTP response shape。
- 不改变 JSONL serialization、导入格式兼容、group/character route ownership。
- 不把 Hono 扩展成默认 endpoint 框架。
- 不让 derived cache 或 SQLite 参与 canonical chat storage。

## Evidence Trail

- `.docs/adr/0010-express-runtime-owner-boundary.md`
- `.docs/adr/0008-hono-route-island-under-express-host.md`
- `.docs/tech/server-startup-orchestration.md`
- `.docs/tech/briefs/260605-04-chat-route-service-extraction.md`
- `src/endpoints/chats.js`
- `src/endpoints/chat-import-converters.js`
- `src/endpoints/chat-route-service.js`
- `tests/chat-import-converters.test.js`
- `tests/chat-route-service.test.js`
