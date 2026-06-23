# Phase 4: 状态管理迁移

**预计工期**：3 个月核心状态迁移 + 分批 main-chat backlog（2027 Q3 起）
**目标**：用 Zustand 替代 `globalThis.SillyTavern` 全局对象，并承接 Phase 3 / 3B 后续 main-chat backlog
**风险等级**：中-高

---

## 概览

Phase 4 建立现代化的状态管理系统，用 Zustand stores 替代全局对象。同时维护兼容层，保证第三方扩展在迁移期间正常工作。3 个月工期只覆盖核心 Zustand / global bridge / extension guide；Phase 4A / 4B 是后续分批 backlog，必须按独立 spec 进入，不能混入 Zustand/global bridge sprint。

---

## 目标

### 主要目标

1. **创建 Zustand stores**：角色、聊天、设置、生成状态
2. **建立兼容层**：双向同步 stores ↔ `globalThis.SillyTavern`
3. **扩展迁移指南**：文档化新状态管理 API
4. **Main-chat transport expansion backlog**：分批评估 `non-OpenAI`、group、dry-run、nested、quiet/background generation 等 excluded transport paths
5. **Main-chat renderer extraction backlog**：抽取 formatter、rich body、media/file/code/LaTeX 和 long-chat windowing contract

### 兼容性目标

- 至少 6 个月内保持 `globalThis.SillyTavern` 可用
- 扩展无需修改即可工作
- 提供迁移指南和代码示例
- 每个 main-chat backlog 项都保留 guarded fallback 和 rollback path

---

## Sprint 列表

| Sprint | 工期 | 目标 | 风险 |
|---|---|---|---|
| [Phase 4 Sprint 1: Zustand stores 创建](phase4-sprint1-zustand-stores.md) | 3 周 | 创建核心 stores | 中 |
| [Phase 4 Sprint 2: 兼容层建立](phase4-sprint2-compat-bridge.md) | 3 周 | 双向同步、事件桥接 | 高 |
| [Phase 4 Sprint 3: 扩展迁移指南](phase4-sprint3-extension-guide.md) | 2 周 | 文档、示例、迁移工具 | 低 |
| Phase 4A: Main-chat compatibility transport expansion | 分批 | excluded transport paths 独立 spec | 高 |
| Phase 4B: Main-chat renderer extraction | 分批 | formatter / renderer / long-chat contract extraction | 高 |

---

## 架构决策

### Zustand Stores 结构

```typescript
// app/stores/characterStore.ts
interface CharacterStore {
  characters: Character[];
  selectedId: string | null;
  selectCharacter: (id: string) => void;
}

// app/stores/chatStore.ts
interface ChatStore {
  messages: ChatMessage[];
  currentChatId: string | null;
  addMessage: (message: ChatMessage) => void;
}

// app/stores/generationStore.ts
interface GenerationStore {
  isGenerating: boolean;
  streamingMessage: string;
  startGeneration: () => void;
  stopGeneration: () => void;
}
```

### 兼容层设计

```typescript
// app/compat/globalBridge.ts
import { useCharacterStore } from '@/stores/characterStore';

// 保持旧 API
globalThis.SillyTavern = {
  get characters() {
    return useCharacterStore.getState().characters;
  },
  selectCharacter(id: string) {
    useCharacterStore.getState().selectCharacter(id);
  },
};
```

---

## 验证门

- [ ] Zustand stores 功能完整
- [ ] 兼容层测试通过
- [ ] 扩展迁移指南完成
- [ ] 至少 5 个常用扩展验证通过
- [ ] `Phase 4A` 每个 transport path 都有 focused unit / E2E / fallback proof
- [ ] `Phase 4B` 每个 renderer extraction 都有 formatter contract / extension compatibility / long-chat performance proof
- [ ] `bun run test:compat` 通过

---

## 下一步

👉 [Phase 5: 后端 API 现代化](../react-phase5-backend-api/README.md)
