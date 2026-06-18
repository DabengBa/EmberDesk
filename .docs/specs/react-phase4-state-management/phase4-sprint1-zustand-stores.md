# Phase 4 Sprint 1: Zustand Stores 创建

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-4-状态管理迁移3-个月)
- **Phase**：[Phase 4 - 状态管理迁移](README.md)
- **Sprint**：Phase 4 Sprint 1（全局 Sprint 23/40）
- **预计工期**：3 周
- **风险等级**：中

---

## 目标

创建核心 Zustand stores，替代分散的全局状态。

### 主要交付物

1. `app/stores/characterStore.ts` - 角色列表、选中角色
2. `app/stores/chatStore.ts` - 当前聊天、消息列表
3. `app/stores/settingsStore.ts` - 用户设置、provider 配置
4. `app/stores/generationStore.ts` - 生成状态、流式状态
5. `app/stores/uiStore.ts` - UI 状态（侧边栏、面板）

### 成功标准

- ✅ 所有核心状态迁移至 Zustand
- ✅ 前端组件通过 store 获取状态
- ✅ 状态变更可追踪（Zustand devtools）
- ✅ 单元测试覆盖 store 逻辑

---

## 技术设计

### CharacterStore

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface CharacterStore {
  characters: Character[];
  selectedId: string | null;
  searchQuery: string;
  filterTags: string[];

  setCharacters: (characters: Character[]) => void;
  selectCharacter: (id: string) => void;
  setSearchQuery: (query: string) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilters: () => void;
}

export const useCharacterStore = create<CharacterStore>()(
  devtools((set) => ({
    characters: [],
    selectedId: null,
    searchQuery: '',
    filterTags: [],

    setCharacters: (characters) => set({ characters }),
    selectCharacter: (id) => set({ selectedId: id }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    toggleFilterTag: (tag) => set((state) => ({
      filterTags: state.filterTags.includes(tag)
        ? state.filterTags.filter(t => t !== tag)
        : [...state.filterTags, tag],
    })),
    clearFilters: () => set({ searchQuery: '', filterTags: [] }),
  }))
);
```

### ChatStore

```typescript
interface ChatStore {
  messages: ChatMessage[];
  currentChatId: string | null;
  isStreaming: boolean;
  streamingContent: string;

  setMessages: (messages: ChatMessage[]) => void;
  setCurrentChat: (chatId: string) => void;
  setStreaming: (isStreaming: boolean) => void;
  appendStreamToken: (token: string) => void;
  clearStream: () => void;
}
```

### GenerationStore

```typescript
type GenerationStatus = 'idle' | 'generating' | 'paused' | 'stopped' | 'error';

interface GenerationStore {
  status: GenerationStatus;
  error: string | null;
  partialMessage: string;

  startGeneration: () => void;
  stopGeneration: () => void;
  pauseGeneration: () => void;
  resumeGeneration: () => void;
  setError: (error: string) => void;
  clearError: () => void;
}
```

---

## 实施步骤

1. 安装 Zustand：`bun add zustand`
2. 创建所有 store 文件
3. 为每个 store 编写单元测试
4. 集成 Zustand DevTools（开发模式）
5. 将现有组件中的 `useState` 替换为 store 调用

---

## 验证清单

- [ ] 所有 store 创建完成
- [ ] 单元测试覆盖 store 逻辑
- [ ] 状态变更可追踪（DevTools）
- [ ] `bun run test:unit` 通过

---

## 下一步

👉 [Phase 4 Sprint 2: 兼容层建立](phase4-sprint2-compat-bridge.md)
