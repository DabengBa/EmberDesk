# Phase 3 Sprint 4: 流式生成 - SSE 连接

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 4（全局 Sprint 17/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

实现 SSE（Server-Sent Events）连接，接收流式生成的 token。

### 主要交付物

1. SSE 连接管理（EventSource）
2. 流式 token 追加到消息列表
3. 流式消息的实时渲染
4. 连接错误处理和重试

### 成功标准

- ✅ SSE 连接正常建立
- ✅ Token 实时追加显示
- ✅ 流式消息渲染无闪烁
- ✅ 连接断开后自动重试

---

## 技术设计

### SSE 连接

```typescript
function useStreamingGeneration() {
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startGeneration = useCallback((chatId: string) => {
    const es = new EventSource(`/api/generate/stream?chatId=${chatId}`);
    eventSourceRef.current = es;
    setIsGenerating(true);
    setStreamingMessage('');

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.token) {
        setStreamingMessage(prev => prev + data.token);
      }
    };

    es.onerror = () => {
      es.close();
      setIsGenerating(false);
    };
  }, []);

  const stopGeneration = useCallback(() => {
    eventSourceRef.current?.close();
    setIsGenerating(false);
  }, []);

  return { streamingMessage, isGenerating, startGeneration, stopGeneration };
}
```

---

## 验证清单

- [ ] SSE 连接正常建立
- [ ] Token 逐个追加显示
- [ ] 流式消息实时渲染
- [ ] 连接断开后重试正常

---

## 下一步

👉 [Phase 3 Sprint 5: 流式生成 - 控制状态](phase3-sprint5-streaming-control.md)
