# Phase 4 Sprint 3: 扩展迁移指南

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-4-状态管理迁移3-个月)
- **Phase**：[Phase 4 - 状态管理迁移](README.md)
- **Sprint**：Phase 4 Sprint 3（全局 Sprint 25/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

编写扩展迁移指南，帮助第三方扩展开发者适配新的状态管理 API。

### 主要交付物

1. `.docs/extension-migration-guide.md` - 迁移指南
2. `.docs/api-changes.md` - API 变更日志
3. `.docs/extension-examples/` - 迁移代码示例
4. 废弃 API 清单和迁移路径

### 成功标准

- ✅ 迁移指南覆盖所有废弃 API
- ✅ 提供旧→新 API 对照表
- ✅ 提供可运行的迁移示例代码
- ✅ 与 3+ 扩展作者沟通确认

---

## 技术设计

### 迁移指南结构

```markdown
# 扩展迁移指南

## 1. 状态访问

### 旧方式（废弃）
```javascript
const characters = globalThis.SillyTavern.characters;
const selectedId = globalThis.SillyTavern.this_chid;
```

### 新方式
```javascript
import { useCharacterStore } from '@/stores/characterStore';

const { characters, selectedId } = useCharacterStore();
```

## 2. 事件系统

### 旧方式（废弃）
```javascript
eventSource.on('message_received', handler);
eventSource.emit('message_sent', data);
```

### 新方式
```javascript
import { eventBus } from '@/compat/eventBridge';

eventBus.on('message_received', handler);
eventBus.emit('message_sent', data);
```

## 3. DOM 选择器

### 保持兼容的选择器
- `.character_select`
- `.mes[mesid]`
- `#chat`
```

---

## 实施步骤

1. 盘点所有废弃 API
2. 编写旧→新对照表
3. 编写迁移示例代码
4. 与扩展作者沟通
5. 收集反馈并更新文档

---

## 验证清单

- [ ] 迁移指南覆盖所有废弃 API
- [ ] 示例代码可运行
- [ ] 至少 3 位扩展作者确认

---

## Phase 4 总结

✅ Sprint 1: Zustand stores 创建  
✅ Sprint 2: 兼容层建立  
✅ Sprint 3: 扩展迁移指南  

---

## 下一步

👉 [Phase 5: 后端 API 现代化](../react-phase5-backend-api/README.md)
