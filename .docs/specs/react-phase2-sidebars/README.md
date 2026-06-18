# Phase 2: 侧边栏和面板迁移

**预计工期**：5 个月（2026 Q3-Q4: 月 10-2）  
**目标**：迁移角色库、世界信息、背景库、扩展宿主面板等侧边栏/面板到 React
**风险等级**：中

---

## 概览

Phase 2 迁移主聊天界面的侧边栏模块。这些模块涉及大量列表渲染和复杂交互，是性能优化的关键区域。

**核心策略**：用虚拟滚动优化长列表性能。

---

## 目标

### 主要目标

1. **角色库面板 React 重写**：虚拟滚动、搜索/过滤、标签管理
2. **世界信息面板 React 重写**：Lorebook 编辑、导入/导出
3. **背景库面板 React 重写**：背景选择、上传/删除
4. **Extensions 面板宿主 React 重写**：保留扩展挂载点、扩展列表入口与 Extras API 区域

### 性能目标

- 1000+ 角色列表流畅滚动（60fps）
- 搜索响应 < 100ms
- 虚拟滚动内存占用 < 现有版本

---

## Sprint 列表

| Sprint | 工期 | 目标 | 风险 |
|---|---|---|---|
| [Phase 2 Sprint 1: 角色库面板 - 列表基础](phase2-sprint1-character-library-list.md) | 3 周 | 虚拟滚动、基础渲染 | 中 |
| [Phase 2 Sprint 2: 角色库面板 - 搜索过滤](phase2-sprint2-character-library-search.md) | 2 周 | 搜索、标签过滤、排序 | 低 |
| [Phase 2 Sprint 3: 角色库面板 - 批量操作](phase2-sprint3-character-library-bulk.md) | 2 周 | 批量选择、删除、标签 | 中 |
| [Phase 2 Sprint 4: 世界信息面板 - 编辑器](phase2-sprint4-world-info-editor.md) | 3 周 | Lorebook 编辑、激活逻辑 | 高 |
| [Phase 2 Sprint 5: 世界信息面板 - 导入导出](phase2-sprint5-world-info-import.md) | 2 周 | 格式转换、批量导入 | 中 |
| [Phase 2 Sprint 6: 背景库面板](phase2-sprint6-background-library.md) | 2 周 | 背景选择、上传管理 | 低 |
| [Phase 2 Sprint 7: Extensions 面板宿主](phase2-sprint7-extensions-host.md) | 3 周 | 扩展宿主 UI、挂载点稳定性、Extras API 区域 | 高 |

---

## 架构决策

### 虚拟滚动

使用 `@tanstack/react-virtual` 优化长列表：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function CharacterList({ characters }: { characters: Character[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: characters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // 每个角色卡片高度
  });
  
  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <CharacterCard
            key={virtualItem.key}
            character={characters[virtualItem.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### 状态管理

使用 Zustand 管理角色库状态：

```typescript
// app/stores/characterStore.ts
import { create } from 'zustand';

interface CharacterStore {
  characters: Character[];
  selectedId: string | null;
  searchQuery: string;
  filterTags: string[];
  
  setCharacters: (characters: Character[]) => void;
  selectCharacter: (id: string) => void;
  setSearchQuery: (query: string) => void;
  toggleFilterTag: (tag: string) => void;
}

export const useCharacterStore = create<CharacterStore>((set) => ({
  characters: [],
  selectedId: null,
  searchQuery: '',
  filterTags: [],
  
  setCharacters: (characters) => set({ characters }),
  selectCharacter: (id) => set({ selectedId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleFilterTag: (tag) => set((state) => ({
    filterTags: state.filterTags.includes(tag)
      ? state.filterTags.filter(t => t !== tag)
      : [...state.filterTags, tag],
  })),
}));
```

---

## 验证门

### Phase 2 完成标准

- [x] ✅ 角色库虚拟滚动实现
- [x] ✅ 1000+ 角色性能测试通过
- [x] ✅ 世界信息编辑器功能完整
- [x] ✅ 背景库上传/删除正常
- [x] ✅ 所有兼容性测试通过

---

## 参考资料

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [TanStack Virtual 文档](https://tanstack.com/virtual/latest)
- [Zustand 文档](https://zustand-demo.pmnd.rs/)

---

## 下一步

👉 [Phase 3: 主聊天工作区迁移](../react-phase3-main-chat/README.md)
