# Phase 3 Sprint 5: 流式生成 - 控制状态

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 5（全局 Sprint 18/40）
- **预计工期**：2 周
- **风险等级**：高

---

## 目标

实现流式生成的控制功能：停止、暂停、恢复、错误恢复。

### 主要交付物

1. 停止生成按钮
2. 暂停/恢复功能
3. 生成错误状态显示
4. 错误后重试功能
5. 生成完成后的消息保存

### 成功标准

- ✅ 停止生成即时生效
- ✅ 暂停/恢复功能正常
- ✅ 错误状态显示正确
- ✅ 错误后可重试
- ✅ 生成完成后消息正确保存

---

## 技术设计

### 生成状态机

```typescript
type GenerationState = 
  | { status: 'idle' }
  | { status: 'generating'; message: string }
  | { status: 'paused'; message: string }
  | { status: 'stopped'; partialMessage: string }
  | { status: 'error'; error: string; partialMessage: string }
  | { status: 'completed'; message: ChatMessage };
```

### 控制按钮

```tsx
function GenerationControls({ state, onStop, onPause, onResume, onRetry }) {
  return (
    <div className="flex gap-2">
      {state.status === 'generating' && (
        <button onClick={onStop} className="btn-danger">停止</button>
      )}
      {state.status === 'generating' && (
        <button onClick={onPause}>暂停</button>
      )}
      {state.status === 'paused' && (
        <button onClick={onResume}>恢复</button>
      )}
      {state.status === 'error' && (
        <button onClick={onRetry}>重试</button>
      )}
    </div>
  );
}
```

---

## 验证清单

- [ ] 停止生成即时生效
- [ ] 暂停后恢复正常
- [ ] 错误状态显示正确
- [ ] 重试功能正常
- [ ] 完成后消息保存正确

---

## 下一步

👉 [Phase 3 Sprint 6: 输入框 - 基础功能](phase3-sprint6-input-basic.md)
