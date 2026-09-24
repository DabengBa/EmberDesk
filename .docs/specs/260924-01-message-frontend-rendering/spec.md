# 消息内前端界面渲染 (Message Frontend Rendering)

> 状态：设计稿，待外部专家审阅。审阅重点见「开放问题」一节。
> 日期：2026-09-24

## 0. 项目基本信息（供外部审阅者）

**EmberDesk** 是一个自托管的浏览器端 LLM 工作台，fork 自 SillyTavern，许可证 AGPL-3.0。它服务"角色卡 + 聊天"的 power-user 工作流：用户导入角色卡、与 LLM 对话、用正则/世界书/预设等机制改造生成过程。

技术栈与本设计相关的部分：

| 层 | 现状 |
|---|---|
| 服务端 | Node.js 24 + Express 5(`src/`)，文件型用户数据存储 |
| 浏览器外壳 | `public/` 下的 HTML/CSS/jQuery 遗留外壳，保留给未迁移表面 |
| 前端应用 | `app/` 下 React 19 + TypeScript + Zustand,Vite 构建；按 ADR-0012,React 是已迁移表面的**唯一运行时 owner**，包括主聊天消息列表 |
| 消息渲染管线 | `messageFormatting()`(`public/scripts/message-service.js`)做宏替换 → 酒馆正则 → markdown(showdown)→ DOMPurify 消毒；产出 HTML 字符串，由 `chat-message-render-service.js` 组装，React 行组件以 `dangerouslySetInnerHTML` 写入 `.mes_text` |
| 事件总线 | `public/scripts/events.js` 的 `eventSource` / `event_types`(`CHAT_LOADED`、`CHARACTER_MESSAGE_RENDERED`、`MESSAGE_EDITED`、`MESSAGE_SWIPED`、`STREAM_TOKEN_RECEIVED` 等） |
| 测试 | `tests/` 独立 pnpm 包：Jest 单元测试 + Playwright E2E |

**战略背景**：项目正在移除外部扩展（extension）能力的兼容支持。历史上通过 `public/scripts/extensions/third-party/` 目录可安装 SillyTavern 生态的第三方插件，其中事实标准插件 **JS-Slash-Runner（酒馆助手 / Tavern Helper)** 提供了"在消息里运行 JavaScript"的能力。项目不再兼容该插件本身，但希望把它最有价值的能力**内化(first-party 化）**为自有功能。本设计覆盖其中第一项：**界面渲染**——把消息中的完整 HTML 文档代码块渲染成活的 iframe 界面（状态栏、仪表盘、小应用等）。

**上游参考**:N0VI028/JS-Slash-Runner(GitHub 1.3k star)。许可证为 PolyForm NonCommercial 1.0.0（仅非商用）——本设计按其行为契约**重新实现**，不 vendoring 上游代码。

## 1. 上游能力拆解（我们要内化的对象）

上游"界面渲染"的机制，经源码核实（main @ 2026-09-24；本仓库兼容性基线曾 pin 在 `b65f48a4`):

### 1.1 检测规则

- 消息 markdown 渲染后，扫描 `.mes_text` 内所有 `pre`（含嵌套在 `<details>` 等元素内的）。
- 判定：`pre` 的**文本内容**包含 `html>`、`<head>` 或 `<body` 之一 → 视为"前端界面"（即 fenced code block 里装了一份完整 HTML 文档）。
- 命中的 `pre` 被包进 `div.TH-render` 槽位，原代码块隐藏，iframe 挂载进槽位。

### 1.2 iframe 文档装配（`createSrcContent`)

组装一份完整 HTML 字符串，以 `srcdoc`（默认）或 Blob URL（调试选项，需 `<base href>`）挂载：

- `<meta viewport>`、CSS reset、`max-width:100%`
- 头像辅助类 `.user_avatar` / `.char_avatar`（绑定当前用户/角色头像 URL)
- `min-height: Nvh` 改写为 `var(--TH-viewport-height)` 的 calc（修正 iframe viewport 与父页面的差异）
- 注入第三方库：jQuery、jQuery UI+TouchPunch、Vue runtime、Vue Router、Tailwind（本地）、FontAwesome——除 Tailwind 外全部走 jsdelivr CDN
- 注入前置脚本：`predefine.js`（把父页面的 `_`、`showdown`、`toastr`、`TavernHelper` 等拷进 iframe window,`TavernHelper._bind` 函数绑定到 iframe 上下文，`pagehide` 时自动清理事件）、`adjust_viewport.js`（同步 `--TH-viewport-height`)、`adjust_iframe_height.js`(iframe 内 ResizeObserver → 直接写 `frameElement.style.height`)、`log.js`
- **iframe 无 `sandbox` 属性**,srcdoc 同源，脚本可自由访问 `window.parent`——这是 TavernHelper API 生效的前提，也是上游 README 安全警告的来源

### 1.3 生命周期

- 重扫触发：`chatLoaded`、`CHARACTER_MESSAGE_RENDERED`、`USER_MESSAGE_RENDERED`、`MESSAGE_UPDATED`、`MESSAGE_SWIPED`、`MESSAGE_DELETED`、`MORE_MESSAGES_LOADED`；设置变更 watch
- 渲染深度 `depth`（从最新楼层计数，0=全部）；`depth_ignore_hidden` 跳过 `is_system` 楼层
- iframe 挂载/加载完成时向事件总线发 `message_iframe_render_started` / `message_iframe_render_ended`(id 形如 `TH-message--{mesid}--{index}`)
- `loading="lazy"`；代码块折叠按钮（显示/隐藏前端代码块）；可选跳过 hljs 高亮
- 可选 `cleanup_protector`：代理 `window.parent`，给 iframe 脚本在父文档创建的 DOM 打标，iframe 卸载时清理残留——上游自己标注为实验项

### 1.4 流式路径（实验项）

开启 `allow_streaming` 后：隐藏 `.mes_text`，在其旁插入 `.TH-streaming` 宿主，把消息 HTML 切块——整块是前端代码 → iframe；元素内含前端代码 → 外层 HTML + 内层嵌套 iframe；其余合并 v-html。每个 `STREAM_TOKEN_RECEIVED` 重切一次。上游对该开关弹"可能不兼容"警告。

## 2. 意图与核心流程

把"消息内含完整 HTML 文档的代码块渲染为活界面"做成 EmberDesk 一等功能：**检测规则与内容生态兼容，宿主集成与 API 面收窄为自有契约**。

核心流程：消息行 `.mes_text` HTML 就位后，扫描器找出符合前端判定的 `pre`，包槽、隐藏代码、挂载同源 srcdoc iframe;iframe 文档由装配器统一包裹（reset CSS、头像类、viewport 变量、前置脚本、自动高度）；行级生命周期由 React 行组件的 effect 拥有，跨行/窗口边界由一个轻量控制器按渲染深度审计。

## 3. 范围 / 不做范围

**包括**:

- 前端代码块检测（沿用上游判定规则）与槽位替换渲染
- iframe 文档装配器（reset、头像辅助类、viewport 变量、vh 改写、前置脚本、自动高度）
- 收窄的 iframe 注入环境（见 §4.3)
- 渲染深度、隐藏楼层跳过、代码块折叠、hljs 跳过、Blob URL 调试模式等设置项
- 编辑/滑动/删除/加载更多/聊天切换下的挂载、重渲与清理
- 嵌套在 `<details>` 等元素内的前端代码块（普通路径天然覆盖）

**不做范围**:

- `window.TavernHelper` API、变量系统、`{{get_*_variable}}` 类宏、脚本库/脚本按钮、音频、Prompt Viewer/Variable Manager 等工具面板、扩展管理 API——这些是另一个功能域的取舍，不在本设计内
- `cleanup_protector` 式父文档写入追踪（上游亦为实验项；残留风险见 §6)
- 流式渲染（Phase 2，见 §4.7)
- `sandbox="allow-scripts"` 严格隔离模式（Phase 2 候选，见 §6)
- 服务端改动、消息持久化格式改动（渲染是客户端投影，消息原文不变）

## 4. 设计

### 4.1 模块划分

- **`public/scripts/frontend-frame.js`**（新，框架中立）:
  - `isFrontendContent(text)`：上游同规则判定（含 `html>` / `<head>` / `<body`)
  - `findFrontendBlocks(rootEl)`：返回待渲染 `pre` 列表（排除已是槽位/编辑态/不可见分支）
  - `buildFrontendFrameDocument(code, opts)`：产出完整 srcdoc 字符串（vh 改写、头像类、前置脚本内联）
  - `mountFrontendFrames(mesTextEl, ctx)` / `unmountFrontendFrames(mesTextEl)`：DOM 侧执行器，包槽、隐藏 `pre`、挂/卸 iframe，幂等
- **`app/components/main-chat/`**:`MainChatMessageRow` 增加 effect——`render.messageHtml` 或编辑态变化后调用 `mountFrontendFrames`；卸载/换 HTML 时清理。React 对 `.mes_text` 用 `dangerouslySetInnerHTML`,HTML 一变整棵子树重建，iframe 随之销毁重建，effect 负责重新扫描——与上游"重扫重挂"语义一致
- **遗留写入路径**:`updateMessageBlock`、编辑提交等仍以 `.html()`/`.append()` 写 `.mes_text` 的位置，复用同一 `mountFrontendFrames`（这些路径只在非 React owner 的显式回退族下生效）
- **控制器**（轻量，挂在消息列表 owner 旁）：订阅 `CHAT_LOADED`、`MESSAGE_DELETED`、`MORE_MESSAGES_LOADED` 与设置变更，按渲染深度审计已挂载帧的存留；行内挂载仍以行 effect 为主

### 4.2 iframe 文档模板

```
<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
[<base href="..."> 仅 blob 调试模式]
<style>
  reset; html,body overflow hidden; max-width 100%;
  .user_avatar/.user-avatar/.char_avatar/.char-avatar { background-image: <当前头像URL> }
</style>
<script>/* 前置脚本：注入工具全局 + EmberDeskFrame API + 高度回报 */</script>
</head><body> {用户代码, vh 已改写} </body></html>
```

- `min-height: Nvh` → `var(--ed-viewport-height)` calc；同时为内容兼容**别名** `--TH-viewport-height`
- 头像类名保留 `.user_avatar` / `.char_avatar`（内容契约，已发布卡片在用）
- **不引入任何 CDN**：前置脚本在同源 srcdoc 内直接从 `window.parent` 拷贝引用，天然同步可用（见 §4.3)
- 挂载方式：默认 `srcdoc`;`use_blob_url` 调试选项走 Blob URL + `<base href>`;`loading="lazy"`

### 4.3 iframe 注入环境（收窄的 API 面）

前置脚本（内联在 srcdoc 头部，先于用户代码执行）:

1. **工具全局**（从 `window.parent` 拷贝，均为 EmberDesk 现有 `/lib.js` 暴露面）:`_`(lodash)、`$`/`jQuery`、`showdown`、`DOMPurify`、`hljs`、`moment`、`SVGInject`。不注入 Vue/Tailwind——需要框架的作者可在自己的 HTML 里自带 CDN 引入，文档注明。
2. **`window.EmberDeskFrame`**（自有最小 API):
   - `frameId`、`messageId`（所在楼层）
   - `on(event, handler)` / `off(event, handler)`：桥接宿主 `eventSource`，白名单事件子集；iframe `pagehide` 时自动退订（上游 `_bind`+`eventClearAll` 同思路）
   - `getContext()`：薄代理 `SillyTavern.getContext()` 的只读快照（chat/character/name 等字段子集，具体字段在实现时冻结）
3. **自动高度**:iframe 内 `ResizeObserver` 观察 `body`,`frameElement.style.height = scrollHeight`(throttle ~500ms)；或等价的父侧 observer 方案，实现时二选一并在 evidence 记录
4. `pagehide` → 退订所有桥接事件（防泄漏）

### 4.4 生命周期接线

| 场景 | 行为 |
|---|---|
| 行 HTML 就位（finalized) | 行 effect 扫描并挂载全部命中 `pre`（含嵌套） |
| `MESSAGE_EDITED` / 进入编辑 | 编辑态 `.mes_text` 换为 textarea,iframe 随 DOM 消失；提交后 HTML 重写 → 重扫重挂 |
| `MESSAGE_SWIPED` / `MESSAGE_UPDATED` | HTML 变化 → effect 清理旧帧重扫 |
| `MESSAGE_DELETED` | 行卸载，帧随 DOM 移除 |
| `CHAT_LOADED` / `MORE_MESSAGES_LOADED` | 控制器按深度审计：超深度帧拆除，新入窗帧补挂 |
| `STREAM_TOKEN_RECEIVED` | Phase 1 不处理；Phase 2 见 §4.7 |
| 窗口 resize | 父侧向各帧 postMessage `ed-frame-viewport`（或同源直写 CSS 变量） |

发出自有事件 `frontend_frame_render_started` / `frontend_frame_render_ended`(payload: frame id `ed-frame--{mesid}--{index}`)，供一方诊断与测试断言。

### 4.5 设置项（`power_user.frontend_frames`，随 settings 持久化）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关（安全 kill switch) |
| `depth` | `0` | 渲染深度，0=全部可见楼层 |
| `depth_ignore_hidden` | `true` | 跳过 `is_system` 楼层且不计入深度 |
| `collapse_code_block` | `'frontend_only'` | `all`/`frontend_only`/`none`；折叠态提供"显示/隐藏前端代码块"按钮（兼作 view-source 入口） |
| `use_blob_url` | `false` | devtools 调试便利 |
| `skip_highlight` | `true` | 前端块跳过 hljs 与复制按钮装饰（上游 `optimize_hljs`) |
| `allow_streaming` | `false` | Phase 2 才生效；Phase 1 置灰或隐藏 |

设置 UI 落 React `/settings`（已迁移表面）；`power_user` 新增字段走既有 settings 读写路径，无服务端改动。

### 4.6 与既有管线的交互

- **`messageFormatting` 不动**：前端代码块经 markdown → `pre>code` → DOMPurify 后仍是被转义的文本，渲染发生在 DOM 侧，消毒语义不变
- **`addCopyToCodeBlocks`**:`skip_highlight` 时对判定为前端的 `pre` 跳过高亮与复制按钮（折叠按钮承担 view-source)
- **`classifyChatMessageRendererContract` 的 `extensionMutated`**：自有槽位标记 `.ed-frontend-frame` / `data-frontend-slot` 必须被识别为**一方产物**而非外来 mutation；遗留 `.TH-render`/`.TH-streaming` 标记的归类随扩展退役轨道另行处理，本设计不为其改名
- **`encode_tags`** 开启时 `<` 被转义，fenced 代码块内容不受影响，检测规则仍成立
- **`uses_system_ui` 消息**与系统消息：默认参与渲染（上游行为），`depth_ignore_hidden` 仅按 `is_system` 过滤

### 4.7 Phase 2：流式渲染

Phase 1 只在 finalized 行渲染（与上游默认 `allow_streaming=false` 一致）。Phase 2 候选方案：

- **A（推荐）**：流式期间仍渲染 `.mes_text`，但只对**已闭合**的前端围栏建帧（以 `</html>` 或围栏结束为完成信号）——比上游"每 token 重切整个 mes_text"便宜得多
- B：复刻上游隐藏 `.mes_text` + 宿主 div 整段重切——成本高、与 React owner 冲突大，仅作备选

## 5. 边界规则 / 验收

- R1: 检测判定与上游一致：仅当 `pre` 文本含 `html>`/`<head>`/`<body` 才渲染；普通代码块不受影响
- R2: iframe 以同源 srcdoc 挂载，默认无 sandbox；`enabled=false` 时零帧挂载且代码块正常显示
- R3: 帧文档不含任何外部 CDN 引用；注入全局仅限 §4.3 白名单
- R4: 行编辑、swipe、更新、删除、加载更多、聊天切换后帧状态正确（无残留、无重复、无错位）
- R5: 超深度楼层的帧被拆除；`depth_ignore_hidden` 语义与上游一致
- R6: `.ed-frontend-frame` 不被 `extensionMutated` 归类；`.mes_text`、`mesid`、`.last_mes` 等受保护选择器不变
- R7: 每个挂载帧发出 `frontend_frame_render_started/ended`;iframe `pagehide` 后无残留事件订阅
- R8: 帧内脚本失效（语法错误/运行时异常）不影响宿主页面与其他帧
- R9: 回滚 = 设置 `enabled=false`（运行时）或部署上一版本（发布）
- R10: 交付时更新 `.docs/db` 语义文档（见 Doc ID 契约）并通过 `docs:check`

## 6. 安全模型

- **信任边界**:iframe 同源、无 sandbox——帧内代码拥有与页面脚本同等能力（读 DOM、带用户会话调 API)。这与上游及卡片生态的既定信任模型一致：HTML 文档是**卡片作者提供的内容**，与卡内正则/脚本同级。
- **消减措施**：全局 `enabled` 开关；折叠按钮提供"先看源码再渲染"路径；文档页面对用户明示风险；不注入任何凭证/密钥句柄（secrets 本就在服务端）。
- **已知缺口**:iframe 脚本可写父文档 DOM（悬浮球等）且随帧移除可能残留——上游用实验性 `cleanup_protector` 解决，我们不移植；Phase 2 可评估 `sandbox="allow-scripts"` + postMessage 报高的严格模式（代价：断 `frameElement` 直写、断父访问、断注入 API)。
- **供审阅者确认**：默认同源是否可接受；是否需要发布级 CSP(`frame-src`/`child-src` 对 srcdoc/blob 的约束）。

## 7. 架构 / 约束

- React 是已迁移消息列表的唯一 owner；帧的挂载/卸载不得引入第二个可见渲染器或产物主——`mountFrontendFrames` 是行 owner 内部的 DOM 执行器，不是独立渲染栈
- 不改 `messageFormatting` / 消毒 / 正则语义；不在 HTML 字符串阶段做帧替换（srcdoc 无法过 DOMPurify，也不该过）
- 不变更消息持久化、slash 解析、regex placement
- 新增浏览器模块走 `public/scripts/` 现有约定；React 侧代码走 `app/` TypeScript 约定
- 不重写上代码；按行为契约实现（上游许可证为 PolyForm NonCommercial，禁止商用，不能并入 AGPL 项目）
- 不引入新依赖

## 8. 数据 / 集成

- 不变：chat JSONL、角色卡格式、settings 服务端读写路径
- 新增：`power_user.frontend_frames` 设置对象（§4.5)，缺省值随 `power_user` 默认表落地
- 新增事件：`frontend_frame_render_started` / `frontend_frame_render_ended`（自有契约，非第三方 API)

## 9. 验证

```bash
# 单元(Jest, tests/):检测表驱动用例、文档装配输出断言、设置默认值
pnpm --dir tests run test:unit -- frontend-frame --runInBand

# 行分类契约:.ed-frontend-frame 归一方产物
pnpm --dir tests run test:unit -- chat-message-render-descriptor.test.js --runInBand

# E2E(Playwright):种子聊天含完整 HTML 代码块 → 开聊断言 iframe/srcdoc/自动高度;
# 编辑显源码、swipe 重渲、删除清理、深度窗口、enabled=false 零帧
pnpm --dir tests run test:e2e -- chat-message-frontend-frames.e2e.js --workers=1

# 回归:既有渲染管线不被破坏
pnpm --dir tests run test:unit -- chat-workspace-structure.test.js --runInBand
pnpm --dir tests run test:e2e -- chat-message-rendering.e2e.js --workers=1

pnpm run docs:check
```

## 10. 开放问题（请审阅者裁决）

1. **内容兼容别名**：帧文档内保留 `--TH-viewport-height`、`.user_avatar`/`.char_avatar` 等生态既有约定（推荐保留，成本极低）；宿主侧标记/事件用 `ed-` 新名（推荐）。是否同意这个切分？
2. **注入 API 范围**:`EmberDeskFrame` 最小面是否够（frameId/messageId/事件桥接/只读 context)？是否 Phase 1 就需要事件桥接，还是首版纯渲染、API 全留 Phase 2?
3. **默认启用与默认深度**：推荐 `enabled=true`、`depth=0`（与上游体感一致）。考虑到同源执行风险，是否应默认 `enabled=false` 或限深度？
4. **sandbox 严格模式**是否值得排进 Phase 2（牺牲自动高度与注入 API，换硬隔离）?
5. **流式渲染**:Phase 2 采用"围栏闭合才建帧"的方案 A 是否满足预期，还是流式整体后置？
6. **`uses_system_ui`/系统消息**是否一律参与渲染，还是默认豁免系统楼层？
7. 是否需要**逐消息/逐卡片**的禁用入口（如消息 action 里的"禁用此界面")，还是全局开关即可？

## 11. Doc ID 契约

- `feature.chat_message_rendering`：交付时新增"消息内前端帧"契约条目（检测规则、槽位标记、行生命周期）
- `page.chat_workspace`：渲染表面归属不变，无需结构改动
- `term.shared_browser_library`：注入全局均来自 `/lib.js` 既有暴露面，契约不变
- 交付时评估新增 `feature.chat_frontend_frames`（或并入 `feature.chat_message_rendering`)

## 12. 参考资料

**上游源码**(N0VI028/JS-Slash-Runner, main @ 2026-09-24；仓库兼容基线 pin `b65f48a4856da9f0947224404d4c08910a8f350f`):

- `src/util/is_frontend.ts`（检测）
- `src/panel/render/iframe.ts` / `Iframe.vue` / `Streaming.vue` / `StreamingOne.vue` / `StreamingIframe.vue` / `StreamingNestedIframe.vue` / `use_collapse_code_block.ts` / `macro_like.ts`（渲染路径）
- `src/iframe/third_party_message.html` / `predefine.js` / `adjust_iframe_height.js` / `adjust_viewport.js` / `cleanup_protector.js` / `script_url.ts`（帧内环境）
- `src/store/iframe_runtimes/message.ts`（生命周期审计）、`src/panel/Render.vue`（设置项）

**本仓库**:

- `public/scripts/message-service.js`:`messageFormatting` (:70)、`updateMessageBlock` (:291)、`addCopyToCodeBlocks` (:750)
- `public/scripts/chat-message-render-service.js`、`public/scripts/chat-message-render-descriptor.js`(:119 行分类契约）
- `app/components/main-chat/MainChatMessageRow.tsx`(:638-641 `.mes_text` 注入点）、`app/stores/main-chat-store.ts`
- `public/scripts/events.js`（事件表）、`public/lib.js`（共享库暴露面）、`public/scripts/public-api.js`
- `.docs/tech/third-party-extension-compatibility.md`、`.docs/tech/main-chat-rendering-call-chain.md`、`.docs/db/features/chat-message-rendering.md`
