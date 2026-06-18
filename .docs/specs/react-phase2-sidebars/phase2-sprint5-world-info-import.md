# Phase 2 Sprint 5: 世界信息面板 - 导入导出

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-2-侧边栏和面板迁移5-个月)
- **Phase**：[Phase 2 - 侧边栏和面板迁移](README.md)
- **Sprint**：Phase 2 Sprint 5（全局 Sprint 12/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

实现世界信息的导入/导出功能，复用已有转换器。

### 主要交付物

1. 文件导入 UI（拖拽 + 选择文件）
2. 批量导入支持
3. 导出功能（JSON、多种格式）
4. 复用 `world-info-converters.js` 已有转换器

### 成功标准

- ✅ 支持 Novel/Agnai/Risu/Character Book 格式导入
- ✅ 批量导入功能正常
- ✅ 导出格式正确
- ✅ `world-info-converters.test.js` 通过

---

## 技术设计

### 复用已有转换器

```typescript
import { convertNovelLorebook, convertAgnaiMemoryBook } from '@sillytavern/scripts/world-info-converters';

// 直接复用，无需重写
const entries = convertNovelLorebook(fileContent);
```

---

## 验证清单

- [ ] 各格式导入正常
- [ ] 批量导入正常
- [ ] 导出文件可重新导入
- [ ] `world-info-converters.test.js` 通过

---

## 下一步

👉 [Phase 2 Sprint 6: 背景库面板](phase2-sprint6-background-library.md)
