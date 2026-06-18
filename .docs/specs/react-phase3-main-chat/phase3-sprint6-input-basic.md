# Phase 3 Sprint 6: 输入框 - 基础功能

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 6（全局 Sprint 19/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

实现聊天输入框的基础功能：文本输入、发送、快捷键。

### 主要交付物

1. 创建 `app/components/chat/MessageInput.tsx`
2. 文本输入和自动调整高度
3. 发送按钮
4. 快捷键（Enter 发送、Shift+Enter 换行）

### 成功标准

- ✅ 文本输入正常
- ✅ 自动调整高度
- ✅ Enter 发送消息
- ✅ Shift+Enter 换行
- ✅ 发送后输入框清空

---

## 技术设计

```tsx
function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onSend(text.trim());
        setText('');
      }
    }
  };

  // 自动调整高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [text]);

  return (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="输入消息..."
      rows={1}
    />
  );
}
```

---

## 验证清单

- [ ] 文本输入正常
- [ ] 自动调整高度正常
- [ ] Enter 发送正常
- [ ] Shift+Enter 换行正常

---

## 下一步

👉 [Phase 3 Sprint 7: 输入框 - 斜杠命令](phase3-sprint7-input-slash.md)
