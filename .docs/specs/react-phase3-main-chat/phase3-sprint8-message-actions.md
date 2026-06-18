# Phase 3 Sprint 8: 消息操作 - 菜单

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 8（全局 Sprint 21/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

用 React 重写消息操作菜单。

### 主要交付物

1. 创建 `app/components/chat/MessageActions.tsx`
2. 编辑消息功能
3. 删除消息功能
4. 复制消息功能
5. 重新生成功能
6. 保持 `.extraMesButtonsHint`、`.extraMesButtons` DOM 结构

### 成功标准

- ✅ 操作菜单正常展开/收起
- ✅ 编辑消息正常
- ✅ 删除消息正常（有确认）
- ✅ 复制消息正常
- ✅ 重新生成正常

---

## 技术设计

### 操作菜单

```tsx
function MessageActions({ message, onEdit, onDelete, onCopy, onRegenerate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="extraMesButtonsHint">
      <button onClick={() => setExpanded(!expanded)}>⋯</button>
      {expanded && (
        <div className="extraMesButtons">
          <button onClick={() => onEdit(message)}>编辑</button>
          <button onClick={() => onDelete(message)}>删除</button>
          <button onClick={() => onCopy(message)}>复制</button>
          <button onClick={() => onRegenerate(message)}>重新生成</button>
        </div>
      )}
    </div>
  );
}
```

---

## 验证清单

- [ ] 操作菜单展开/收起正常
- [ ] 编辑功能正常
- [ ] 删除有确认对话框
- [ ] 复制功能正常
- [ ] 重新生成功能正常
- [ ] `chat-message-actions-controller.test.js` 通过

---

## 下一步

👉 [Phase 3 Sprint 9: 整合测试](phase3-sprint9-integration.md)
