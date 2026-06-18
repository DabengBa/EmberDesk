# Phase 3 Sprint 2: 消息列表 - Markdown 和媒体

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 2（全局 Sprint 15/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

为消息列表添加 Markdown 渲染、代码高亮、LaTeX 和媒体嵌入支持。

### 主要交付物

1. Markdown 渲染（复用现有 marked.js + DOMPurify）
2. 代码高亮（复用 highlight.js）
3. LaTeX 渲染（复用 KaTeX）
4. 图片/视频/音频嵌入
5. 保持 `.mes_media_wrapper` DOM 结构

### 成功标准

- ✅ Markdown 格式正确渲染
- ✅ 代码块语法高亮正常
- ✅ LaTeX 公式正确渲染
- ✅ 媒体文件嵌入和播放正常

---

## 技术设计

### 复用现有依赖

项目已有：`marked.js`、`highlight.js`、`KaTeX`、`DOMPurify`

```typescript
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import katex from 'katex';

function renderMessageContent(text: string): string {
  // 1. 处理 LaTeX
  text = renderLatex(text);
  // 2. Markdown → HTML
  const html = marked(text, { highlight: (code) => hljs.highlightAuto(code).value });
  // 3. 消毒 HTML
  return DOMPurify.sanitize(html);
}
```

---

## 验证清单

- [ ] Markdown 列表、表格、链接正常
- [ ] 代码高亮正常
- [ ] LaTeX 公式正常
- [ ] 图片嵌入正常
- [ ] 视频/音频嵌入正常

---

## 下一步

👉 [Phase 3 Sprint 3: 消息列表 - 滚动和定位](phase3-sprint3-message-list-scroll.md)
