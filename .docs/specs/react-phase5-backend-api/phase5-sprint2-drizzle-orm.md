# Phase 5 Sprint 2: Drizzle ORM 集成

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-5-后端-api-现代化3-个月)
- **Phase**：[Phase 5 - 后端 API 现代化](README.md)
- **Sprint**：Phase 5 Sprint 2（全局 Sprint 27/40）
- **预计工期**：3 周
- **风险等级**：中

---

## 目标

用 Drizzle ORM 替代手写 SQL 查询，增强 SQLite derived cache 的类型安全。

### 主要交付物

1. 创建 `app/server/db/schema.ts` - Drizzle schema
2. 迁移 `src/derived-cache-sqlite.js` 到 Drizzle
3. 迁移 `src/endpoints/character-index.js` 到 Drizzle
4. 保持 `_cache/character-index.sqlite` 文件路径不变
5. 保持 derived-cache 语义（可重建、非 canonical）

### 成功标准

- ✅ Drizzle schema 与现有 SQLite 结构兼容
- ✅ 查询结果与手写 SQL 一致
- ✅ `character-index.test.js` 通过
- ✅ `derived-cache-sqlite.test.js` 通过

---

## 技术设计

### Drizzle Schema

```typescript
// app/server/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  avatar: text('avatar'),
  tags: text('tags'), // JSON string
  chatSize: integer('chat_size'),
  dateLastChat: integer('date_last_chat'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  characterId: text('character_id'),
  fileName: text('file_name'),
  lastMessage: text('last_message'),
  messageCount: integer('message_count'),
});
```

### 类型安全查询

```typescript
import { eq, like, desc } from 'drizzle-orm';
import { db, characters } from './db';

// 替代手写 SQL
const results = await db
  .select()
  .from(characters)
  .where(like(characters.name, `%${searchQuery}%`))
  .orderBy(desc(characters.dateLastChat));
```

---

## 实施步骤

1. 安装 Drizzle ORM：`bun add drizzle-orm better-sqlite3`
2. 创建 schema 文件
3. 生成迁移文件
4. 迁移 character-index 查询
5. 迁移 derived-cache 查询
6. 测试

---

## 验证清单

- [ ] Drizzle schema 与现有表结构兼容
- [ ] 查询结果正确
- [ ] `bun run --cwd tests test:unit -- character-index.test.js --runInBand` 通过
- [ ] `bun run --cwd tests test:unit -- derived-cache-sqlite.test.js --runInBand` 通过

---

## 下一步

👉 [Phase 5 Sprint 3: Express 完全切换](phase5-sprint3-express-sunset.md)
