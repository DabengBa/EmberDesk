# Phase 3 Sprint 7: 输入框 - 斜杠命令

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 7（全局 Sprint 20/40）
- **预计工期**：3 周
- **风险等级**：高

---

## 目标

为输入框添加斜杠命令解析和自动补全功能。

### 主要交付物

1. 斜杠命令识别（`/` 开头触发）
2. 命令自动补全下拉框
3. 命令参数解析
4. 保持斜杠命令注册表面不变
5. 保持 `@sillytavern/scripts/slash-commands` 兼容

### 成功标准

- ✅ `/` 触发自动补全
- ✅ 命令列表正确显示
- ✅ Tab/Enter 选择命令
- ✅ 命令参数传递正确
- ✅ 现有斜杠命令全部可用

---

## 背景

### 复杂度

`public/scripts/slash-commands.js` 有 6,951 行：
- 根解析器实例和执行函数
- 默认命令注册（聊天、角色、生成、API、变量、宏、群聊等）
- 命令执行（解析器标志、作用域、闭包、abort/pause/debug）
- 自动补全设置

### 兼容性约束

- `executeSlashCommands` 必须保持可用
- `registerSlashCommand` 必须保持可用
- `@sillytavern/scripts/slash-commands` 别名必须保持
- regex placement `SLASH_COMMAND` 值不能改变

---

## 技术设计

### 命令触发

```typescript
function useSlashCommand(input: string) {
  const [suggestions, setSuggestions] = useState<SlashCommand[]>([]);

  useEffect(() => {
    if (input.startsWith('/')) {
      const query = input.slice(1);
      const commands = getRegisteredCommands(); // 复用现有命令注册
      setSuggestions(commands.filter(cmd => cmd.name.startsWith(query)));
    } else {
      setSuggestions([]);
    }
  }, [input]);

  return suggestions;
}
```

### 兼容层

```typescript
// 复用现有斜杠命令解析器，不重写
import { parser, executeSlashCommands } from '@sillytavern/scripts/slash-commands';

// 在 React 组件中调用现有执行逻辑
const result = await executeSlashCommands(text);
```

---

## 验证清单

- [ ] `/` 触发自动补全
- [ ] 命令列表正确
- [ ] Tab 选择命令
- [ ] 命令执行正常
- [ ] `bun run test:compat` 通过

---

## 下一步

👉 [Phase 3 Sprint 8: 消息操作 - 菜单](phase3-sprint8-message-actions.md)
