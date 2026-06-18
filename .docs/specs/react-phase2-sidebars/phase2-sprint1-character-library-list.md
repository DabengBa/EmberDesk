# Phase 2 Sprint 1: 角色库面板 - 列表基础

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-2-侧边栏和面板迁移5-个月)
- **Phase**：[Phase 2 - 侧边栏和面板迁移](README.md)
- **Sprint**：Phase 2 Sprint 1（全局 Sprint 8/40）
- **预计工期**：3 周
- **风险等级**：中

---

## 目标

用 React + 虚拟滚动重写角色库列表，优化大库性能。

### 主要交付物

1. 创建 `app/components/character-library/CharacterList.tsx`
2. 用 `@tanstack/react-virtual` 实现虚拟滚动
3. 复用 `/api/characters/all` API
4. 保持角色卡片 DOM 结构（`.character_select`、`data-chid`）

### 成功标准

- ✅ 1000+ 角色列表流畅滚动（60fps）
- ✅ 角色卡片渲染正确
- ✅ `character-list-*.test.js` 通过
- ✅ 内存占用 ≤ 现有 jQuery 版本

---

## 背景

### 性能瓶颈

现有 jQuery 角色库在大库场景（1000+ 角色）下存在性能问题：
- 全量 DOM 渲染，初次加载慢
- 无虚拟滚动，长列表滚动卡顿
- 图片全部加载，内存占用高

### 已有基础设施

- `public/scripts/character-list-state.js` - 状态管理
- `public/scripts/character-list-render-state.js` - 渲染规划
- `src/endpoints/character-read-service.js` - 后端 read service

---

## 技术设计

### 虚拟滚动实现

```tsx
function CharacterList({ characters }: { characters: Character[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: characters.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <CharacterCard
            key={item.key}
            character={characters[item.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### 图片懒加载

```tsx
function CharacterAvatar({ src }: { src: string }) {
  return (
    <img
      src={src}
      loading="lazy"
      decoding="async"
      alt=""
      className="w-12 h-12 rounded-full object-cover"
    />
  );
}
```

---

## 实施步骤

1. 创建 Zustand store `useCharacterStore`（基础版本）
2. 用 TanStack Query 获取 `/api/characters/all`
3. 实现 `CharacterList` 虚拟滚动组件
4. 实现 `CharacterCard` 单项组件
5. 图片懒加载集成
6. 性能测试

---

## 验证清单

- [ ] 1000 角色列表首次渲染 < 500ms
- [ ] 滚动帧率 ≥ 55fps
- [ ] 角色卡片选择正常
- [ ] `bun run --cwd tests test:unit -- character-list-*.test.js --runInBand` 通过
- [ ] `bun run test:compat` 通过

---

## 交付标准（Definition of Done）

- [ ] 性能验证通过
- [ ] Code review 完成
- [ ] 合并到 `csp-dev-techupgrade` 分支

---

## 下一步

👉 [Phase 2 Sprint 2: 角色库面板 - 搜索过滤](phase2-sprint2-character-library-search.md)
