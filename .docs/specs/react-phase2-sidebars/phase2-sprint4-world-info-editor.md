# Phase 2 Sprint 4: 世界信息面板 - 编辑器

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-2-侧边栏和面板迁移5-个月)
- **Phase**：[Phase 2 - 侧边栏和面板迁移](README.md)
- **Sprint**：Phase 2 Sprint 4（全局 Sprint 11/40）
- **预计工期**：3 周
- **风险等级**：高

---

## 目标

用 React 重写世界信息（Lorebook）编辑器面板。

### 主要交付物

1. 创建 `app/components/world-info/WorldInfoEditor.tsx`
2. 创建 `app/components/world-info/WorldInfoEntry.tsx`
3. 迁移编辑器 UI（卡片折叠、分页、搜索、排序）
4. 保持 `/api/worldinfo/*` API 不变
5. 保持 regex placement `WORLD_INFO` 值不变

### 成功标准

- ✅ 世界信息条目增删改查正常
- ✅ 条目激活逻辑（关键词、选择器、正则）正常
- ✅ `world-info-card-rendering.test.js` 通过
- ✅ `bun run test:compat` 通过

---

## 背景

### 复杂度

`public/scripts/world-info.js` 有 6,605 行，是前端最复杂的模块之一：
- 设置状态管理、选中世界、缓存和持久化
- Prompt 激活逻辑（扫描、插入位置、定时效果、包含组、递归、正则应用）
- 编辑器 UI（卡片折叠、分页、搜索、排序、状态切换）
- 导入/导出
- 斜杠命令注册

### 安全边界

已抽取的 helper：
- `public/scripts/world-info-converters.js` - 外部格式转换器
- 后续可继续抽取编辑器渲染规划 helper

---

## 技术设计

### 组件结构

```
app/components/world-info/
├─ WorldInfoEditor.tsx         # 编辑器容器
├─ WorldInfoEntry.tsx          # 单个条目
├─ WorldInfoEntryForm.tsx      # 条目编辑表单
├─ WorldInfoToolbar.tsx        # 工具栏（搜索、排序、导入/导出）
└─ WorldInfoActivationPreview.tsx # 激活预览
```

### 状态管理

```typescript
interface WorldInfoState {
  worlds: WorldInfo[];
  selectedWorldId: string | null;
  entries: WorldInfoEntry[];
  searchQuery: string;
  sortOrder: 'name' | 'position' | 'date';
}
```

---

## 验证清单

- [ ] 条目创建/编辑/删除正常
- [ ] 条目状态切换（启用/禁用）正常
- [ ] 搜索和排序功能正常
- [ ] `bun run test:compat` 通过
- [ ] `world-info-card-rendering.test.js` 通过

---

## 下一步

👉 [Phase 2 Sprint 5: 世界信息面板 - 导入导出](phase2-sprint5-world-info-import.md)
