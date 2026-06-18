# Phase 3: 主聊天工作区迁移

**预计工期**：6 个月（2027 Q1-Q2: 月 1-6）  
**目标**：迁移核心聊天界面到 React  
**风险等级**：高 ⚠️

---

## 概览

Phase 3 是整个现代化路线图的**核心和最高风险阶段**。主聊天工作区是 EmberDesk 最复杂的模块，包含消息渲染、流式生成、斜杠命令、消息操作等核心功能。

**关键策略**：
1. 分阶段迁移（消息列表 → 流式生成 → 输入框 → 操作菜单）
2. 充分的 E2E 测试覆盖
3. 性能基准对比
4. 保持扩展兼容性（`.mes` DOM 结构）

---

## 目标

### 主要目标

1. **聊天消息列表 React 重写**：虚拟滚动、长聊天优化
2. **流式生成 React 重写**：SSE 连接、token 追加、停止/恢复
3. **聊天输入框 React 重写**：斜杠命令解析、自动补全
4. **消息操作菜单 React 重写**：编辑、删除、复制、重新生成

### 性能目标

- 1000 条消息滚动流畅（60fps）
- 流式生成延迟 < 50ms
- 输入框响应 < 100ms

---

## Sprint 列表

| Sprint | 工期 | 目标 | 风险 |
|---|---|---|---|
| [Phase 3 Sprint 1: 消息列表 - 基础渲染](phase3-sprint1-message-list-basic.md) | 3 周 | 静态消息渲染、虚拟滚动 | 中 |
| [Phase 3 Sprint 2: 消息列表 - Markdown 和媒体](phase3-sprint2-message-list-rich.md) | 2 周 | Markdown、代码高亮、LaTeX、媒体嵌入 | 中 |
| [Phase 3 Sprint 3: 消息列表 - 滚动和定位](phase3-sprint3-message-list-scroll.md) | 2 周 | 滚动恢复、自动滚动、定位稳定性 | 高 |
| [Phase 3 Sprint 4: 流式生成 - SSE 连接](phase3-sprint4-streaming-sse.md) | 2 周 | SSE 连接、token 追加 | 中 |
| [Phase 3 Sprint 5: 流式生成 - 控制状态](phase3-sprint5-streaming-control.md) | 2 周 | 停止、暂停、恢复、错误恢复 | 高 |
| [Phase 3 Sprint 6: 输入框 - 基础功能](phase3-sprint6-input-basic.md) | 2 周 | 文本输入、发送、快捷键 | 低 |
| [Phase 3 Sprint 7: 输入框 - 斜杠命令](phase3-sprint7-input-slash.md) | 3 周 | 斜杠命令解析、自动补全 | 高 |
| [Phase 3 Sprint 8: 消息操作 - 菜单](phase3-sprint8-message-actions.md) | 2 周 | 操作菜单、编辑、删除 | 中 |
| [Phase 3 Sprint 9: 整合测试](phase3-sprint9-integration.md) | 2 周 | 完整流程测试、性能优化 | 高 |

---

## 架构决策

### DOM 兼容性保持

保持 `.mes` class 和 `mesid` 属性（扩展依赖）：

```tsx
function Message({ message }: { message: ChatMessage }) {
  return (
    <div 
      className={`mes ${message.is_user ? 'is_user' : ''}`}
      data-mesid={message.mesid}
    >
      <div className="mes_text">
        {renderMessageContent(message.text)}
      </div>
    </div>
  );
}
```

### 虚拟滚动优化

长聊天使用虚拟滚动：

```tsx
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 150, // 动态计算消息高度
  overscan: 5,
});
```

---

## 验证门

### Phase 3 完成标准

- [x] ✅ 1000 条消息性能测试通过
- [x] ✅ 流式生成端到端测试通过
- [x] ✅ 斜杠命令兼容性测试通过
- [x] ✅ 扩展兼容性测试通过（`.mes` DOM）
- [x] ✅ 用户验收测试通过

---

## 参考资料

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [主聊天后继者范围](../../tech/main-chat-successor-scope.md)

---

## 下一步

👉 [Phase 4: 状态管理迁移](../react-phase4-state-management/README.md)
