# Phase 5: 后端 API 现代化

**预计工期**：3 个月（2027 Q4: 月 10-12）  
**目标**：评估并分阶段用 Hono 接管 Express 路由，建立类型安全的 API 层
**风险等级**：中

---

## 概览

Phase 5 现代化后端 API 层，按 ADR 批准范围用 Hono 接管 Express 路由，建立前后端类型共享。本阶段默认不改变 file-backed user data 的正本地位；Drizzle 只能先接管 derived SQLite cache，任何 canonical storage 变更都必须另起 ADR。

---

## 目标

### 主要目标

1. **Hono API 路由搭建**：重写核心 API 端点
2. **Drizzle ORM 集成**：类型安全的数据库访问
3. **Express 切换或保留 fallback**：只有在 ADR、route parity 和 middleware-order proof 完成后，才允许下线 Express；否则保留明确 fallback

### 边界条件

- Hono 接管前必须先有 ADR，覆盖 middleware order、session、CSRF、auth wall、static/public routes、private routes、uploads、error/404 handler 和 rollback plan。
- Drizzle 不得直接把 derived SQLite cache 提升为用户数据正本。
- Express sunset 必须等待 route parity、middleware-order proof、API compatibility tests 和 startup proof 完成。

---

## Sprint 列表

| Sprint | 工期 | 目标 | 风险 |
|---|---|---|---|
| [Phase 5 Sprint 1: Hono 路由搭建](phase5-sprint1-hono-routes.md) | 3 周 | 重写角色、聊天 API | 中 |
| [Phase 5 Sprint 2: Drizzle ORM 集成](phase5-sprint2-drizzle-orm.md) | 3 周 | SQLite derived cache 迁移到 Drizzle | 中 |
| [Phase 5 Sprint 3: Express 完全切换](phase5-sprint3-express-sunset.md) | 2 周 | 按 ADR 执行 Express sunset 或保留 fallback | 中 |

---

## 架构决策

### Hono 路由结构

```typescript
// app/server/routes/characters.ts
import { Hono } from 'hono';
import { z } from 'zod';

const app = new Hono();

const CharacterSchema = z.object({
  name: z.string(),
  description: z.string(),
});

app.post('/api/characters', async (c) => {
  const body = await c.req.json();
  const character = CharacterSchema.parse(body);
  // ...
  return c.json({ character });
});
```

### Drizzle ORM Schema

```typescript
// app/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});
```

---

## 验证门

- [ ] Hono API 端点功能完整
- [ ] Drizzle ORM 类型安全验证
- [ ] Express middleware order 等价证明完成
- [ ] Express 完全下线或保留 fallback 的 ADR 已批准
- [ ] 所有 API 测试通过
- [ ] `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand` 通过
- [ ] `bun run test:compat` 通过

---

## 下一步

👉 [Phase 6: 扩展兼容性演进](../react-phase6-extension-compat/README.md)（持续维护）
