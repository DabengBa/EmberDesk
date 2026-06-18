# Phase 5 Sprint 1: Hono 路由搭建

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-5-后端-api-现代化3-个月)
- **Phase**：[Phase 5 - 后端 API 现代化](README.md)
- **Sprint**：Phase 5 Sprint 1（全局 Sprint 26/40）
- **预计工期**：3 周
- **风险等级**：中

---

## 目标

用 Hono 重写核心 API 路由，建立类型安全的 API 层。

### 主要交付物

1. 创建 `app/server/routes/characters.ts` - 角色 API
2. 创建 `app/server/routes/chats.ts` - 聊天 API
3. 创建 `app/server/routes/settings.ts` - 设置 API
4. 创建 `app/server/routes/users.ts` - 用户 API
5. 用 Zod 验证请求体和响应体

### 成功标准

- ✅ Hono API 端点功能与 Express 版本一致
- ✅ API 请求/响应格式不变
- ✅ Zod 验证正常工作
- ✅ 前端请求正确代理到 Hono

---

## 技术设计

### Hono 路由结构

```typescript
// app/server/routes/characters.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const app = new Hono();

const CharacterSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/characters
app.get('/api/characters', async (c) => {
  const characters = await getCharacterList();
  return c.json(characters);
});

// POST /api/characters
app.post('/api/characters', zValidator('json', CharacterSchema), async (c) => {
  const data = c.req.valid('json');
  const character = await createCharacter(data);
  return c.json(character, 201);
});

export default app;
```

### 类型共享

```typescript
// app/server/types/api.ts
import { z } from 'zod';

export const CharacterResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().url().optional(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export type CharacterResponse = z.infer<typeof CharacterResponseSchema>;
```

---

## 实施步骤

1. 安装 Hono 和相关依赖
2. 创建 Hono 应用入口
3. 逐个迁移 API 端点
4. 配置 Hono 和 Express 并行运行
5. 前端切换到 Hono API
6. 测试所有端点

---

## 验证清单

- [ ] 所有 API 端点功能正常
- [ ] 请求/响应格式与 Express 版本一致
- [ ] Zod 验证正常工作
- [ ] 前端请求正确路由

---

## 下一步

👉 [Phase 5 Sprint 2: Drizzle ORM 集成](phase5-sprint2-drizzle-orm.md)
