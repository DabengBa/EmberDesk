# Phase 3 Sprint 1: 消息列表 - 基础渲染

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 1（全局 Sprint 14/40）
- **预计工期**：3 周
- **风险等级**：中

---

## 目标

用 React + 虚拟滚动实现聊天消息列表的基础渲染。

### 主要交付物

1. 创建 `app/components/chat/MessageList.tsx`
2. 创建 `app/components/chat/MessageRow.tsx`
3. 用 `@tanstack/react-virtual` 实现虚拟滚动
4. 保持 `.mes` class 和 `mesid` 属性
5. 复用 `/api/chats/get` API

### 成功标准

- ✅ 消息列表正确渲染
- ✅ 虚拟滚动正常工作
- ✅ 1000 条消息首次渲染 < 300ms
- ✅ `.mes[mesid]` DOM 结构保持（扩展兼容性）

---

## 技术设计

### DOM 兼容性

必须保持以下选择器（扩展依赖）：

```tsx
<div className="mes" data-mesid={message.mesid}>
  <div className="mes_text">{content}</div>
  <div className="mes_reasoning_details">{reasoning}</div>
</div>
```

### 虚拟滚动

```tsx
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: (index) => {
    // 动态估算消息高度
    return estimateMessageHeight(messages[index]);
  },
  overscan: 5,
});
```

---

## 验证清单

- [ ] 消息列表渲染正确
- [ ] 1000 条消息渲染 < 300ms
- [ ] 滚动帧率 ≥ 55fps
- [ ] `.mes` DOM 结构保持
- [ ] `bun run test:compat` 通过

---

## 下一步

👉 [Phase 3 Sprint 2: 消息列表 - Markdown 和媒体](phase3-sprint2-message-list-rich.md)
