# Phase 5 Sprint 3: Express 完全切换

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-5-后端-api-现代化3-个月)
- **Phase**：[Phase 5 - 后端 API 现代化](README.md)
- **Sprint**：Phase 5 Sprint 3（全局 Sprint 28/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

下线 Express，完成到 Hono 的完全切换。

### 主要交付物

1. 移除 Express 依赖
2. 移除 `src/endpoints/` 中已迁移的 Express 路由
3. 清理 `src/server-main.js` 中的 Express 相关代码
4. 更新 `server.js` 入口使用 Hono
5. 更新 Docker 配置

### 成功标准

- ✅ Express 依赖移除
- ✅ Hono 成为唯一 API 框架
- ✅ 所有 API 端点正常工作
- ✅ Docker 部署正常
- ✅ 性能不劣化

---

## 实施步骤

### 步骤 1：验证 Hono 覆盖率

```bash
# 检查所有 API 端点是否已迁移到 Hono
grep -r "app.get\|app.post" src/endpoints/ | wc -l
grep -r "c.req\|c.json" app/server/routes/ | wc -l
```

### 步骤 2：更新 server.js

```javascript
// server.js
import { serve } from '@hono/node-server';
import { app } from './app/server/index.js';

serve({
  fetch: app.fetch,
  port: process.env.PORT || 3000,
});
```

### 步骤 3：移除 Express 依赖

```bash
bun remove express body-parser cors compression helmet
```

### 步骤 4：清理旧代码

```bash
# 删除已迁移的 Express 路由文件
rm src/endpoints/characters.js
rm src/endpoints/chats.js
rm src/endpoints/settings.js
# ... 其他已迁移的文件
```

### 步骤 5：更新 Docker 配置

```dockerfile
# Dockerfile
COPY --from=builder /app/app/dist ./app/dist
COPY --from=builder /app/app/server ./app/server
CMD ["node", "server.js"]
```

### 步骤 6：测试

```bash
bun run test:unit
bun run test:e2e
bun run perf:startup
```

---

## 验证清单

- [ ] Express 依赖已移除
- [ ] Hono 成为唯一 API 框架
- [ ] 所有 API 端点正常
- [ ] Docker 部署正常
- [ ] 性能测试通过

---

## Phase 5 总结

✅ Sprint 1: Hono 路由搭建  
✅ Sprint 2: Drizzle ORM 集成  
✅ Sprint 3: Express 完全切换  

---

## 下一步

👉 [Phase 6: 扩展兼容性演进](../react-phase6-extension-compat/README.md)（持续维护）
