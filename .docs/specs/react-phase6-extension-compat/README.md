# Phase 6: 扩展兼容性演进

**预计工期**：持续维护（2028 Q1+）  
**目标**：维护第三方扩展兼容性，提供迁移指南  
**风险等级**：低

---

## 概览

Phase 6 是持续维护阶段，不是独立的 Sprint 集合。主要工作是维护兼容层、更新文档、协助扩展开发者迁移。

---

## 目标

### 主要目标

1. **兼容层维护**：至少 6 个月保持旧 API 可用
2. **扩展迁移指南**：文档化新 API
3. **社区支持**：协助扩展开发者迁移

---

## 持续工作

### 1. 兼容层维护期（6 个月）

从 Phase 4 完成开始，至少维护 6 个月：

```
2027-09 (Phase 4 完成) → 2028-03（兼容层结束）
```

在此期间：
- 保持 `globalThis.SillyTavern` 可用
- 保持 `eventSource` / `event_types` 可用
- 保持 `@sillytavern/*` 别名可用

### 2. 废弃警告

在兼容层中添加废弃警告：

```typescript
// app/compat/globalBridge.ts
globalThis.SillyTavern = new Proxy({}, {
  get(target, prop) {
    console.warn(
      `[DEPRECATED] globalThis.SillyTavern.${String(prop)} is deprecated. ` +
      `Please use useCharacterStore() from '@/stores/characterStore'. ` +
      `See migration guide: https://docs.emberdesk.dev/migration`
    );
    return useCharacterStore.getState()[prop];
  },
});
```

### 3. 扩展市场审核

与常用扩展作者合作：

| 扩展名称 | 优先级 | 迁移状态 |
|---|---|---|
| Tavern Helper | P0 | 🚧 进行中 |
| JS-Slash-Runner | P0 | ⏳ 待开始 |
| Extensions Manager | P1 | ⏳ 待开始 |
| Quick Reply | P1 | ⏳ 待开始 |
| Regex Manager | P2 | ⏳ 待开始 |

---

## 交付物

### 文档

- `.docs/extension-migration-guide.md` - 扩展迁移指南
- `.docs/api-changes.md` - API 变更日志
- `.docs/extension-examples/` - 迁移代码示例

---

## 参考资料

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [第三方扩展兼容性](../../tech/third-party-extension-compatibility.md)
