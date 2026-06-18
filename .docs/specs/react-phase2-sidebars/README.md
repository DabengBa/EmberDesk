# Phase 2: 侧边栏和面板迁移

**预计工期**：5 个月（2026 Q3-Q4: 月 10-2）  
**目标**：迁移角色库、世界信息、背景库、扩展宿主面板等侧边栏/面板到 React
**风险等级**：中

---

## 概览

Phase 2 迁移主聊天界面的侧边栏模块。这些模块涉及大量列表渲染和复杂交互，是性能优化的关键区域。

**核心策略**：用 guarded React panel islands 逐步替换高频工作区面板；React 只接管已验证的宿主、列表、表单和动作入口，legacy 面板继续保留 fallback 与扩展兼容面。

---

## 目标

### 主要目标

1. **角色库面板 React island**：虚拟滚动、搜索/过滤、批量操作呈现
2. **世界信息面板 React island**：宿主状态、world 选择、搜索/排序、创建、导入/导出和 entry 入口，实际扫描/prompt/regex/delete 语义继续由 legacy owner 执行
3. **背景库面板 React island**：宿主状态、filter/sort、global/chat gallery 呈现和背景动作入口，文件/API/slash 行为继续由 legacy owner 执行
4. **Extensions 面板宿主 React island**：通知、Manage、Install、Extras API host controls 与受保护 mount-point 状态，第三方扩展协议和挂载点继续保持 legacy owner

### 性能目标

- 1000+ 角色列表流畅滚动（60fps）
- 搜索响应 < 100ms
- 虚拟滚动内存占用 < 现有版本
- World Info、Backgrounds、Extensions 的 React host 失败或 flag 关闭时不影响 legacy 面板可用性

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

### 状态和表单边界

- React-owned server/readiness state 使用 TanStack Query。
- React-owned form or control state 使用 TanStack Form + Zod。
- 长列表窗口化使用 `@tanstack/react-virtual`。
- Zustand 不属于 Phase 2 已采用依赖；全局状态迁移仍留给 Phase 4。
- 仍由 legacy 拥有的 tag filter、World Info prompt activation、regex、background file operations、slash commands 和 third-party extension protocol 不进入 React form schema。

---

## 验证门

### Phase 2 当前完成标准

- [x] ✅ 角色库虚拟滚动实现
- [x] ✅ 1000+ 角色性能测试通过
- [x] ✅ World Info guarded React host/action island 已接入；legacy 扫描、prompt、regex、delete 语义保留
- [x] ✅ Background Library guarded React host/action island 已接入；legacy 上传/删除/重命名/选择/slash 语义保留
- [x] ✅ Extensions Host guarded React host/action island 已接入；受保护 mount points 和第三方扩展兼容面保留
- [x] ✅ 兼容性证明覆盖 third-party extension boundary

---

## 参考资料

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [TanStack Virtual 文档](https://tanstack.com/virtual/latest)
- [TanStack Query 文档](https://tanstack.com/query/latest)
- [TanStack Form 文档](https://tanstack.com/form/latest)
- [Zod 文档](https://zod.dev/)

---

## 下一步

👉 [Phase 3: 主聊天工作区迁移](../react-phase3-main-chat/README.md)
