# Phase 4 Sprint 2: 兼容层建立

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-4-状态管理迁移3-个月)
- **Phase**：[Phase 4 - 状态管理迁移](README.md)
- **Sprint**：Phase 4 Sprint 2（全局 Sprint 24/40）
- **预计工期**：3 周
- **风险等级**：高

---

## 目标

建立兼容层，双向同步 Zustand stores 和 `globalThis.SillyTavern` 全局对象。

### 主要交付物

1. `app/compat/globalBridge.ts` - 全局对象桥接
2. `app/compat/eventBridge.ts` - 事件系统桥接
3. `app/compat/importAliasBridge.ts` - `@sillytavern/*` 别名保持
4. 废弃警告机制
5. 兼容层单元测试

### 成功标准

- ✅ `globalThis.SillyTavern.characters` 正确返回 Zustand store 数据
- ✅ `eventSource.on()` 和 `eventSource.emit()` 正常工作
- ✅ `@sillytavern/*` 别名正常导入
- ✅ 第三方扩展无需修改即可工作
- ✅ `bun run test:compat` 通过

---

## 技术设计

### globalBridge.ts

```typescript
import { useCharacterStore } from '@/stores/characterStore';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';

// 代理对象，访问时触发废弃警告
const deprecatedProxy = <T extends object>(store: T, name: string) => 
  new Proxy(store, {
    get(target, prop) {
      console.warn(
        `[DEPRECATED] globalThis.SillyTavern.${name}.${String(prop)} is deprecated. ` +
        `Use use${name.charAt(0).toUpperCase() + name.slice(1)}Store() instead.`
      );
      return Reflect.get(target, prop);
    },
  });

globalThis.SillyTavern = {
  get characters() {
    return useCharacterStore.getState().characters;
  },
  get this_chid() {
    return useCharacterStore.getState().selectedId;
  },
  selectCharacter(id: string) {
    useCharacterStore.getState().selectCharacter(id);
  },
  // ... 其他兼容方法
};
```

### eventBridge.ts

```typescript
import { create } from 'zustand';

type EventHandler = (...args: any[]) => void;

interface EventBus {
  listeners: Map<string, Set<EventHandler>>;
  on: (event: string, handler: EventHandler) => void;
  off: (event: string, handler: EventHandler) => void;
  emit: (event: string, ...args: any[]) => void;
}

export const eventBus: EventBus = {
  listeners: new Map(),
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  },
  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  },
  emit(event, ...args) {
    this.listeners.get(event)?.forEach(handler => handler(...args));
  },
};

// 全局兼容
globalThis.eventSource = eventBus;
```

---

## 实施步骤

1. 创建 `app/compat/` 目录
2. 实现 globalBridge.ts
3. 实现 eventBridge.ts
4. 实现 importAliasBridge.ts
5. 测试第三方扩展加载
6. 运行兼容性测试

---

## 验证清单

- [ ] `globalThis.SillyTavern` 正确桥接
- [ ] `eventSource.on/emit` 正常工作
- [ ] `@sillytavern/*` 别名正常导入
- [ ] 至少 3 个扩展验证通过
- [ ] `bun run test:compat` 通过

---

## 下一步

👉 [Phase 4 Sprint 3: 扩展迁移指南](phase4-sprint3-extension-guide.md)
