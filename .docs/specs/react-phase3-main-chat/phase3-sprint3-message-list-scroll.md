# Phase 3 Sprint 3: 消息列表 - 滚动和定位

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 3（全局 Sprint 16/40）
- **预计工期**：2 周
- **风险等级**：高

---

## 目标

实现聊天滚动行为：自动滚动到底部、滚动恢复、长聊天加载更多。

### 主要交付物

1. 自动滚动到最新消息
2. 用户上滚时暂停自动滚动
3. 长聊天 load-more（加载历史消息）
4. 滚动位置恢复（切换聊天后恢复）

### 成功标准

- ✅ 新消息到达时自动滚动
- ✅ 用户上滚时不打断阅读
- ✅ 长聊天加载更多无闪烁
- ✅ 切换聊天后滚动位置恢复

---

## 技术设计

### 自动滚动

```tsx
useEffect(() => {
  if (autoScroll) {
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }
}, [messages.length, autoScroll]);
```

### 滚动检测

```tsx
const handleScroll = () => {
  const el = parentRef.current;
  if (!el) return;
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  setAutoScroll(isAtBottom);
};
```

---

## 验证清单

- [ ] 新消息自动滚动
- [ ] 上滚暂停自动滚动
- [ ] load-more 无闪烁
- [ ] 滚动位置恢复正确

---

## 下一步

👉 [Phase 3 Sprint 4: 流式生成 - SSE 连接](phase3-sprint4-streaming-sse.md)
