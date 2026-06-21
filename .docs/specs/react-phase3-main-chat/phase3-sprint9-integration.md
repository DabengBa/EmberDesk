# Phase 3 Sprint 9: 整合测试

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 9（全局 Sprint 22/40）
- **预计工期**：2 周
- **风险等级**：高

---

## 目标

完成主聊天工作区的端到端整合测试和性能优化。

### 主要交付物

1. 完整聊天流程 E2E 测试
2. 性能基准测试
3. 性能优化（如有劣化）
4. 兼容性测试全覆盖
5. 用户验收测试

### 成功标准

- ✅ 完整聊天流程 E2E 测试通过
- ✅ 1000 条消息性能测试通过
- ✅ 流式生成端到端测试通过
- ✅ 扩展兼容性测试通过
- ✅ `bun run perf:interaction` 不劣化

---

## 测试矩阵

### E2E 测试

```powershell
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js
bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js
```

### 兼容性测试

```powershell
bun run test:compat
```

### 性能测试

```powershell
bun run perf:interaction
bun run perf:startup
```

### 单元测试

```powershell
bun run --cwd tests test:unit -- chat-workspace-structure.test.js --runInBand
bun run --cwd tests test:unit -- chat-message-actions-controller.test.js --runInBand
```

---

## 验证清单

- [ ] 所有 E2E 测试通过
- [ ] 所有兼容性测试通过
- [ ] 性能基准不劣化
- [ ] 1000 条消息滚动流畅
- [ ] 流式生成无卡顿

---

## Phase 3 总结

✅ Sprint 1: 消息列表基础渲染  
✅ Sprint 2: Rich Message Body
✅ Sprint 3: 滚动和定位  
✅ Sprint 4: SSE 连接  
✅ Sprint 5: 控制状态  
✅ Sprint 6: 输入框基础  
✅ Sprint 7: 斜杠命令  
✅ Sprint 8: 消息操作菜单  
✅ Sprint 9: 整合测试  

---

## 下一步

👉 [Phase 4: 状态管理迁移](../react-phase4-state-management/README.md)
