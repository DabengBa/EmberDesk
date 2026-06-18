# Phase 1 Sprint 3: Settings 面板 React 重写

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-1-独立页面迁移3-个月)
- **Phase**：[Phase 1 - 独立页面迁移](README.md)
- **Sprint**：Phase 1 Sprint 3（全局 Sprint 7/40）
- **预计工期**：4 周
- **风险等级**：中

---

## 目标

将主界面中的 Settings 面板迁移到 React，收口为统一的 React `/settings` 入口，并使用稳定的 tabbed layout 重构。

### 主要交付物

1. 创建 `app/routes/settings/index.tsx`
2. 创建 `app/components/settings/SettingsTabs.tsx`
3. 分离各设置模块为独立 React 组件，并明确 legacy drawer 到 React tabs 的归属
4. 用 TanStack Form + Zod 管理设置表单、校验和 dirty state
5. 用 TanStack Query 管理设置加载、保存和 provider 密钥状态
6. 保持 `/api/settings/*` 和 `/api/secrets/*` API 不变
7. 产出一份可审阅的 legacy 字段映射表，明确 React 已接管和仍由 legacy 承担的设置项

### 成功标准

- ✅ Settings 面板所有 Tab 可正常切换
- ✅ 设置保存/加载功能正常
- ✅ 现有设置相关 E2E 测试通过
- ✅ Provider 配置（OpenAI、Anthropic 等）正常工作
- ✅ React Settings 表单由 TanStack Form + Zod 驱动
- ✅ Settings 数据加载/保存状态由 TanStack Query 驱动

---

## 背景

### 现有实现

当前产品并不存在一个已经收口完成的独立 `Settings` 页面。Sprint 3 所说的 `Settings 面板`，指的是将主界面里分散的设置相关 drawer 收口成一个由 React 路由拥有的统一设置入口。

当前 legacy 来源如下：

| Legacy 来源 | Sprint 3 归属 | 说明 |
|---|---|---|
| `User Settings` | 纳入 | 需要拆分到 `User Interface` 和 `Advanced` 两个 React tabs |
| `API Connections` | 纳入 | 对应 `Providers` tab，继续复用 `/api/secrets/*` |
| `Advanced Formatting` | 纳入 | 主要归属 `Advanced` tab |
| `AI Response Configuration` 中的全局设置子集 | 部分纳入 | 仅纳入全局默认生成行为和提示词行为相关配置，不要求原 drawer 原样照搬 |
| `World Info` | 排除 | 属于 Phase 2 |
| `Backgrounds` | 排除 | 属于 Phase 2 |
| `Extensions` | 排除 | 独立扩展表面，不属于本 Sprint |
| `Persona Management` | 排除 | 独立管理表面，不属于本 Sprint |

这意味着文档中的 `General / Providers / User Interface / Advanced` 是 React 侧重新分组后的信息架构，不是现有 legacy drawer 的一一同名映射。

### React Tabs 边界

| React Tab | 主要来源 | 典型内容 |
|---|---|---|
| `General` | `AI Response Configuration` 的全局设置子集 | preset、context/max response、streaming、web search、function calling、reasoning、continue 行为、全局 prompt 行为开关 |
| `Providers` | `API Connections` | provider/model、base URL、API key、fallback provider、Vertex AI、连接测试、prompt post-processing |
| `User Interface` | `User Settings` 的视觉和布局子集 | 语言、theme preset、theme colors、chat width、font scale、avatar/chat/media style、notification、MovingUI、界面个性化 |
| `Advanced` | `Advanced Formatting` + `User Settings` 的 power-user 子集 + `AI Response Configuration` 的高级子集 | context/instruct/system prompt、custom stopping strings、tokenizer、advanced sampling、chat/message handling、auto-continue、auto-complete、STscript、debug/power-user 开关 |

### 字段级范围清单

以下清单用于实现切片，不要求一次性拆成同名 React 组件，但 tab 归属应保持稳定。

- `General`
  - preset 管理与切换
  - `Context` / `Max Response`
  - `Streaming`、`Top K`
  - `Web Search`、`Function Calling`、`Inline Media`
  - `Model Reasoning`、`Reasoning Effort`
  - Claude prefill / impersonation prefill
  - `Prompt Manager`
  - `Image Generation`
  - `Character Names Behavior`、`Continue Postfix`、`Continue Prefill`、`Squash System Messages`
  - `Logit Bias` presets

- `Providers`
  - provider / model 选择
  - unified API key
  - base URL
  - fallback provider
  - Vertex AI 配置
  - prompt post-processing
  - connect / cancel / additional parameters / test / status

- `User Interface`
  - UI preset CRUD
  - avatar / chat / media style
  - notification position
  - theme colors
  - chat width / font scale / blur / shadow
  - reduced motion / no blur / no text shadows / visual novel mode
  - message timer / timestamps / model icons / message number display
  - MovingUI / reset / presets
  - custom CSS

- `Advanced`
  - `Context Template` / `Instruct Template` / `System Prompt`
  - custom stopping strings
  - tokenizer / token padding
  - reasoning settings
  - advanced sampling
  - interleaved thinking
  - message handling power-user settings（`# Msg. to Load`、streaming FPS、example messages、swipes、auto-load last chat、auto-scroll、auto-save edits、confirm delete、auto-fix markdown、forbid external media、show names/tags、macro engine、group trimming、prompt logging、token probabilities、group chat queue、pin styles）
  - `Auto-swipe`
  - `Auto-Continue`
  - `AutoComplete Settings`
  - `STscript Settings`

### 独立页面定位说明

尽管 legacy 形态是主工作区内的 drawer，Sprint 3 仍将其视为 Phase 1 的“独立页面迁移”范围，原因是本 Sprint 迁移的是设置内容本身，而不是聊天工作区 shell、侧边栏编排或相邻管理面板。实现上可以由工作区入口跳转到 React `/settings` 路由，或在保持入口位置不变的前提下挂载 React 设置内容，但内容边界以上表为准。

**复杂度**：`public/scripts/openai.js` 就有 4,674 行，其中大量 Settings UI 逻辑。

### API

- `POST /api/settings/get` - 加载设置
- `POST /api/settings/save` - 保存设置
- `/api/secrets/*` - API 密钥管理

---

## 技术设计

### 组件结构

```
app/routes/settings/
├─ index.tsx                    # Settings 入口
├─ general.tsx                  # 通用设置
├─ providers.tsx                # Provider 配置
├─ user-interface.tsx           # UI 设置
└─ advanced.tsx                 # 高级设置

app/components/settings/
├─ SettingsTabs.tsx             # Tab 导航
├─ SettingSection.tsx           # 设置区块
├─ SettingToggle.tsx            # 开关
├─ SettingInput.tsx             # 输入框
├─ SettingSelect.tsx            # 下拉选择
└─ ProviderSecretField.tsx      # API 密钥字段
```

### 表单与状态管理

```typescript
const settingsSchema = z.object({
  general: generalSettingsSchema,
  providers: providersSettingsSchema,
  userInterface: userInterfaceSettingsSchema,
  advanced: advancedSettingsSchema,
});

const settingsQuery = useQuery({
  queryKey: ['settings'],
  queryFn: () => fetch('/api/settings/get', { method: 'POST' }).then(r => r.json()),
});

const form = useForm({
  defaultValues: settingsQuery.data,
  validators: {
    onSubmit: settingsSchema,
  },
});

const saveMutation = useMutation({
  mutationFn: (settings) => fetch('/api/settings/save', {
    method: 'POST',
    body: JSON.stringify(settings),
  }),
});
```

- `TanStack Query` 负责设置加载、保存、provider 连接测试、secret 状态刷新
- `TanStack Form + Zod` 负责 tab 内字段编排、校验、dirty state 和保存前数据整形
- provider 密钥字段继续复用 `/api/secrets/*`，不要把 secret 持久化逻辑混入普通 `/api/settings` 保存流

### 推荐迁移切片

1. `Providers`：API 契约最集中，且用户价值直接
2. `User Interface`：视觉反馈明确，便于做 React UI 对齐
3. `General`：梳理 `AI Response Configuration` 中真正属于“全局设置”的部分
4. `Advanced`：最后收口高复杂度模板、tokenizer 和 power-user 配置

### 优先级分层

#### P0（Sprint 3 必须完成）

- `Providers` 全量
- `User Interface` 中的主题、布局、语言、通知、MovingUI、custom CSS
- `General` 中的 preset、context/max response、streaming、function calling、reasoning、Prompt Manager、continue 相关设置
- `Advanced` 中的 context/instruct/system prompt、custom stopping strings、tokenizer、advanced sampling、auto-continue、auto-complete
- feature flag、legacy 回退、设置读写、provider secret 管理

#### P1（同 Sprint 内尽量完成）

- `General` 中的 image generation、Claude prefill、logit bias
- `Advanced` 中的 auto-swipe、reasoning formatting、interleaved thinking、prompt logging、token probabilities
- `User Interface` 中的更多聊天显示细节开关

#### P2（允许拆到后续收口，但必须在 spec 中显式记录）

- 仍未纳入 React 的零散 power-user 开关
- 难以在首轮 React 结构中稳定复刻、且缺乏测试保护的设置块

若存在 P2 延后项，必须在交付时列出“React 已覆盖字段”和“仍由 legacy 承担的字段”，不能默默遗漏。

---

## 实施步骤

1. 锁定 legacy drawer -> React tabs 的字段映射，先确认纳入和排除边界
2. 用 shadcn/ui Tabs 创建 `SettingsTabs` 组件和页面级布局
3. 用 TanStack Form + Zod 建立 settings schema 和 tab 级表单组织
4. 用 TanStack Query 管理设置加载、保存、provider 测试和 secret 状态
5. 按 `Providers` -> `User Interface` -> `General` -> `Advanced` 的顺序迁移
6. 集成 `features.react.pages.settings` feature flag 和 legacy 回退
7. 测试

---

## 验证清单

- [ ] 所有 Tab 正常切换
- [ ] 设置项读取和保存正常
- [ ] Provider API 密钥配置正常
- [ ] `features.react.pages.settings` 开关和 legacy 回退正常
- [ ] `World Info` / `Backgrounds` / `Extensions` / `Persona Management` 未被误纳入本 Sprint
- [ ] legacy 字段映射表与实现一致，无静默遗漏
- [ ] `bun run test:unit` 通过
- [ ] 移动端响应式正常

---

## 交付标准（Definition of Done）

- [ ] 功能验证清单 100% 完成
- [ ] Code review 完成（Settings 复杂度高，需 2 人 approve）
- [ ] 合并到 `csp-dev-techupgrade` 分支

---

## Phase 1 总结

Phase 1 的 3 个 Sprint 全部完成后，独立页面迁移就绪：

✅ Sprint 1: Login 页面  
✅ Sprint 2: Setup 页面  
✅ Sprint 3: Settings 面板

---

## 下一步

👉 [Phase 2: 侧边栏和面板迁移](../react-phase2-sidebars/README.md)
