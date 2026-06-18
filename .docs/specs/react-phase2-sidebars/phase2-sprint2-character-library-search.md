# Phase 2 Sprint 2: 角色库面板 - 搜索过滤

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-2-侧边栏和面板迁移5-个月)
- **Phase**：[Phase 2 - 侧边栏和面板迁移](README.md)
- **Sprint**：Phase 2 Sprint 2（全局 Sprint 9/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

为角色库添加搜索、标签过滤和排序功能。

### 主要交付物

1. 创建 `app/components/character-library/SearchBar.tsx`
2. 创建 `app/components/character-library/TagFilter.tsx`
3. 创建 `app/components/character-library/SortControls.tsx`
4. 客户端搜索/过滤逻辑（已有 Fuse.js）

### 成功标准

- ✅ 搜索响应 < 100ms
- ✅ 标签过滤实时更新
- ✅ 排序选项可用（名称、日期、大小）

---

## 技术设计

### 搜索

使用 Fuse.js（项目已有依赖）进行客户端模糊搜索：

```typescript
const fuse = new Fuse(characters, {
  keys: ['name', 'description', 'tags'],
  threshold: 0.3,
});

const results = fuse.search(searchQuery);
```

### 标签过滤

```typescript
const filteredCharacters = characters.filter(char =>
  filterTags.length === 0 ||
  filterTags.some(tag => char.tags?.includes(tag))
);
```

---

## 验证清单

- [ ] 搜索响应 < 100ms（1000 角色）
- [ ] 标签过滤正确
- [ ] 排序结果正确
- [ ] 空搜索结果显示全部角色

---

## 下一步

👉 [Phase 2 Sprint 3: 角色库面板 - 批量操作](phase2-sprint3-character-library-bulk.md)
