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

**上游参考**:N0VI028/JS-Slash-Runner（主仓在 GitLab:`gitlab.com/novi028/JS-Slash-Runner`;GitHub 上为镜像）。许可证为 PolyForm NonCommercial 1.0.0（仅非商用）——本设计按其行为契约**重新实现**，不 vendoring 上游代码。

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
- `EmberDeskFrame` 事件桥接（`on`/`off`）与 `getContext()` 快照——Phase 2，见 §10 裁决 2;Phase 1 帧内 API 仅 `frameId`/`messageId`
- `cleanup_protector` 式父文档写入追踪（上游亦为实验项；残留风险见 §6)
- 流式渲染（Phase 2，见 §4.7)
- `sandbox="allow-scripts"` 严格隔离模式（Phase 2 候选，见 §6)
- 逐消息/逐卡片禁用入口（Phase 2 候选，见 §10 裁决 7)
- 服务端改动、消息持久化格式改动（渲染是客户端投影，消息原文不变）

## 4. 设计

### 4.1 模块划分

- **`public/scripts/frontend-frame.js`**（新，框架中立、**无模块状态**——app 侧经 Vite 打包会得到第二份模块实例，一切状态只可存于 DOM 标记与入参 `ctx`):
  - `isFrontendContent(text)`：上游同规则判定（含 `html>` / `<head>` / `<body`)
  - `findFrontendBlocks(rootEl)`：返回待渲染 `pre` 列表（排除已是槽位/编辑态的块；**不按 CSS 可见性排除**——闭合 `<details>` 内的前端块仍要渲染，与上游一致）
  - `buildFrontendFrameDocument(code, opts)`：产出完整 srcdoc 字符串（vh 改写、头像类、前置脚本内联）
  - `mountFrontendFrames(mesTextEl, ctx)` / `unmountFrontendFrames(mesTextEl)`：DOM 侧执行器，包槽、隐藏 `pre`、挂/卸 iframe，幂等（`StrictMode` 双跑安全）；卸载即移除 `.ed-frontend-frame` 槽位子树，iframe 随 DOM 移除而销毁
- **`app/components/main-chat/`**:`MainChatMessageRow` 增加 effect——经 `app/compat/frontend-frames` 适配层调用 `mountFrontendFrames`。**effect 必须带 `message.state === 'finalized'` 守卫**：流式期间 projection 每 token 重建 `messageHtml`(`normalizeMessageState` 产出 `streaming` 态），无守卫时未闭合的 `<html>` 片段会在流式中提前命中检测并反复挂/拆帧。React 对 `.mes_text` 用 `dangerouslySetInnerHTML`,HTML 一变整棵子树重建，iframe 随之销毁重建；实测 React 提交阶段还会在同名 prop 字符串下重写 innerHTML（序列化等价但字节不同），所以 effect **不设 dep 数组**——每次 commit 后自愈式重扫（`mountFrontendFrames` 对已挂槽幂等、对失格行自卸，空扫成本极低）；展开/收起意图按 frameId 记入模块级集合，重写重挂后恢复，用户点击不被无关渲染打断
- **遗留写入路径**:`updateMessageBlock`、编辑提交等仍以 `.html()`/`.append()` 写 `.mes_text` 的位置，复用同一 `mountFrontendFrames`（这些路径只在非 React owner 的显式回退族下生效；React owner 下 `updateMessageBlock` 提前 return + remount)
- **控制器**（轻量，挂在消息列表 owner 旁）：订阅 `CHAT_LOADED`、`MESSAGE_DELETED`、`MORE_MESSAGES_LOADED`、`SETTINGS_UPDATED` 与帧设置变更信号。**控制器只负责"拆"**：深度窗口变化/`enabled=false` 后扫描 `#chat` 内已挂载 `.ed-frontend-frame`，拆除失格帧。**深度资格必须在挂载前判定**——iframe 一旦插入脚本即执行，事后拆除无法收回副作用；行 effect 调用 `mountFrontendFrames` 时由 `ctx` 当场计算该行深度资格（从 `orderedMessageIds`/`window.visibleMessageIds` 末尾向前数楼层，`depth_ignore_hidden` 时跳过 `is_system`)，不合格直接不挂

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
- **不引入任何 CDN**：前置脚本在同源 srcdoc 内直接从 `window.parent` 拷贝引用，天然同步可用（见 §4.3)。注意 jQuery 不是 `/lib.js` 暴露面，是 `index.html` 的 script 标签全局；同源下两者都能从 `window.parent` 拿到
- 挂载方式：默认 `srcdoc`;`use_blob_url` 调试选项走 Blob URL + `<base href>`(blob 继承创建者 origin，仍为同源，注入机制不变）；`loading="lazy"`
- iframe 一律带 `title` 属性（如 `ed-frame--{mesid}--{index}`)，满足 a11y 与测试断言

### 4.3 iframe 注入环境（收窄的 API 面）

前置脚本（内联在 srcdoc 头部，先于用户代码执行）:

1. **工具全局**（从 `window.parent` 拷贝；其中 `_`/DOMPurify/hljs/SVGInject/showdown/moment 是 `/lib.js` 暴露面，`$`/`jQuery` 是 `index.html` script 标签全局——同源下都可直接引用）:`_`(lodash)、`$`/`jQuery`、`showdown`、`DOMPurify`、`hljs`、`moment`、`SVGInject`。不注入 Vue/Tailwind——需要框架的作者可在自己的 HTML 里自带 CDN 引入，文档注明。
2. **`window.EmberDeskFrame`**（自有最小 API,Phase 1 仅两个字段）:
   - `frameId`、`messageId`（所在楼层）
   - Phase 2 候选：`on(event, handler)` / `off(event, handler)` 桥接宿主 `eventSource`（白名单事件子集）、`getContext()` 只读快照——见 §10 裁决 2
3. **自动高度**:iframe 内 `ResizeObserver` 观察 `body`,`frameElement.style.height = scrollHeight`(throttle ~500ms)；或等价的父侧 observer 方案，实现时二选一并在 evidence 记录
4. **视口变量**:srcdoc 同源，帧内脚本可直接读 `window.parent.innerHeight` 并给 parent 挂 `resize` 监听（或轮询），把 `--ed-viewport-height`/`--TH-viewport-height` 写到自身 `documentElement`——不需要父侧 postMessage

> **注意**：收窄注入面是**生态/便利契约，不是安全边界**。srcdoc 同源意味着帧内脚本随时可经 `window.parent` 拿到完整 `getContext()`、`eventSource` 任意事件、用户会话凭证——白名单与只读快照管不住这层。安全语义只由 §6 的信任模型与 `enabled` 开关承载。同理，**退订/清理不能依赖帧内 `pagehide`**(iframe 被 DOM 移除时跨浏览器派发不可靠）:Phase 1 帧无桥接订阅可清；Phase 2 若加事件桥接，必须由宿主侧注册表按 frameId 统一退订（`unmountFrontendFrames` 时执行），帧内 `pagehide` 只作冗余兜底。

### 4.4 生命周期接线

| 场景 | 行为 |
|---|---|
| 行 HTML 就位且 `state === 'finalized'` | 行 effect 先做深度资格判定，通过则扫描并挂载全部命中 `pre`（含嵌套） |
| `state` 为 `streaming`/`editing`/`extension-mutated`/`error` | effect 直接跳过：不扫描、不挂载（流式中 `messageHtml` 每 token 重建，未闭合 `<html>` 片段会被检测规则提前命中） |
| `MESSAGE_EDITED` / 进入编辑 | 编辑态 `.mes_text` 换为 textarea,iframe 随 DOM 消失；提交后 HTML 重写 → 重扫重挂 |
| `MESSAGE_SWIPED` / `MESSAGE_UPDATED` | HTML 变化 → effect 清理旧帧重扫 |
| `MESSAGE_DELETED` | 行卸载，帧随 DOM 移除 |
| `CHAT_LOADED` / `MORE_MESSAGES_LOADED` | 新入窗行由各自 effect 自挂载；控制器拆除因深度窗口移动而失格的已挂载帧 |
| `STREAM_TOKEN_RECEIVED` | Phase 1 不处理（行态守卫已覆盖）;Phase 2 见 §4.7 |
| 设置变更（`SETTINGS_UPDATED`/帧设置信号） | 控制器全扫：失格帧拆除；行 effect 经变更信号重跑补挂（含 `enabled` 关闭→清零） |
| 窗口 resize | 帧内自维护：`window.parent.innerHeight` + parent `resize` 监听，更新 `--ed-viewport-height`/`--TH-viewport-height`；不需父侧 postMessage |

发出自有事件 `frontend_frame_render_started` / `frontend_frame_render_ended`(payload: frame id `ed-frame--{mesid}--{index}`)，供一方诊断与测试断言。事件名注册进 `event_types` 表（与现有 snake_case 约定一致）,emit 经 ctx 注入的 `eventSource`（或直接 `document` CustomEvent)，避免 app bundle 内联第二份 `events.js` 实例。

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

设置 UI 落 React `/settings`/User Settings 面板（已迁移表面，沿用 contract-DOM 控件 id + `power-user.js` jQuery 绑定模式）;`power_user` 新增字段走既有 settings 读写路径，无服务端改动。**注意 `loadPowerUserSettings` 是 `Object.assign` 浅合并**:`frontend_frames` 需按 `stscript` 嵌套对象先例做加载归一化（非对象/缺键回填默认表）。设置变更通过 `SETTINGS_UPDATED`（或专用帧信号）触发控制器再审计与行重扫，不要求整聊重载。

### 4.6 与既有管线的交互

- **`messageFormatting` 不动**：前端代码块经 markdown → `pre>code` → DOMPurify 后仍是被转义的文本，渲染发生在 DOM 侧，消毒语义不变
- **`addCopyToCodeBlocks`**:React 行目前不走该函数（所有调用点都被 `isReactMainChatOwner` 门控）,`skip_highlight` 只影响遗留回退路径——在 `addCopyToCodeBlocks` 内部对判定为前端的 `pre` 跳过高亮与复制按钮（折叠按钮承担 view-source)
- **`classifyChatMessageRendererContract` 的 `extensionMutated`**：该入参目前只被契约测试驱动，运行时 `normalizeMessageState` 尚不产出 `extension-mutated` 态。本条为**前向约束**：后续任何 DOM mutation 检测落地时，自有槽位标记 `.ed-frontend-frame` / `data-frontend-slot` 必须列入一方产物白名单而非外来 mutation；遗留 `.TH-render`/`.TH-streaming` 标记的归类随扩展退役轨道另行处理，本设计不为其改名
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
- R5: 超深度楼层的帧**在挂载前就被拒绝**（无瞬时挂载再拆）；深度窗口/设置变化后失格帧被拆除；`depth_ignore_hidden` 语义与上游一致
- R6: `.ed-frontend-frame`/`data-frontend-slot` 在任何 mutation 检测中归一方产物；`.mes_text`、`mesid`、`.last_mes` 等受保护选择器不变
- R7: 每个挂载帧发出 `frontend_frame_render_started/ended`;Phase 1 帧内无桥接订阅，卸载由宿主侧 DOM 移除完成（后续事件桥接落地时，退订由宿主侧注册表执行，不依赖帧内 `pagehide`)
- R8: 帧内脚本失效（语法错误/运行时异常）不影响宿主页面与其他帧
- R9: 回滚 = 设置 `enabled=false`（运行时）或部署上一版本（发布）
- R10: 交付时更新 `.docs/db` 语义文档（见 Doc ID 契约）并通过 `docs:check`

## 6. 安全模型

- **信任边界**:iframe 同源、无 sandbox——帧内代码拥有与页面脚本同等能力（读 DOM、带用户会话调 API、经 `window.parent` 取完整 `getContext()`/`eventSource`)。这与上游及卡片生态的既定信任模型一致：HTML 文档是**卡片作者提供的内容**，与卡内正则/脚本同级。**§4.3 的注入收窄不构成安全边界**——同源下帧脚本总能触达父页全部全局。
- **消减措施**：全局 `enabled` 开关；折叠按钮提供"先看源码再渲染"路径；文档页面对用户明示风险；不注入任何凭证/密钥句柄（secrets 本就在服务端）。
- **已知缺口**:
  - iframe 脚本可写父文档 DOM（悬浮球等）且随帧移除可能残留——上游用实验性 `cleanup_protector` 解决，我们不移植
  - 同源 srcdoc 与主页面共享主线程/进程：帧内死循环会冻结整个工作台
  - 帧可渲染与宿主一致的 UI，存在伪造界面/钓鱼风险——用户文档应明示"仅对可信卡片内容启用"
  - 帧与宿主共享 `localStorage`/cookie 源
  - Phase 2 可评估 `sandbox="allow-scripts"`（不加 `allow-same-origin`)+ postMessage 报高的严格模式（代价：变 opaque origin，断 `frameElement` 直写、断父访问、断注入 API，等于另一套帧内环境）
- **CSP 现状**：服务端 `helmet({ contentSecurityPolicy: false })` 显式关闭 CSP,srcdoc/blob 帧无约束问题；若未来启用 CSP，注意 srcdoc 继承父 CSP（内联 `<script>` 需 `script-src` 放行）、`frame-src` 需含 `blob:`。发布级 CSP 非本次交付项。

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

# 兼容门禁:触及 .mes_text DOM/mutation 分类契约
pnpm run test:compat

pnpm run docs:check
```

## 10. 开放问题（评审裁决已落地）

1. **内容兼容别名** → **裁决：保留**。帧文档内 `--TH-viewport-height`、`.user_avatar`/`.char_avatar` 是已发卡内容契约，零成本；宿主侧标记/事件用 `ed-` 新名。
2. **注入 API 范围** → **裁决：Phase 1 只给 `frameId`/`messageId` + 工具全局 + 自动高度**；事件桥接与 `getContext` 后置。同源下注入面不构成安全收益，过早发布只会冻结一个尚无消费者的契约；等第一个真实用例再定字段。
3. **默认启用与默认深度** → **裁决：`enabled=true`、`depth=0`**。信任级别与卡内正则/`uses_system_ui` 放宽消毒同级，且有 kill switch + view-source 兜底；§6 如实写明这是被接受的既定信任模型而非隔离。
4. **sandbox 严格模式** → **裁决：留 Phase 2 候选**，注意无 `allow-same-origin` 即 opaque origin：自动高度须切 postMessage 报高，注入 API 全断，是另一套帧内环境，工作量按独立 spec 评估。
5. **流式渲染** → **裁决：Phase 2 方案 A**（围栏闭合才建帧）；Phase 1 由 `finalized` 行态守卫天然正确。
6. **`uses_system_ui`/系统消息** → **裁决：一律参与渲染**（上游一致）;`depth_ignore_hidden` 已给 `is_system` 出口；`uses_system_ui` 本就是放宽消毒的受信内容。
7. **逐消息/逐卡片禁用** → **裁决：Phase 1 不做**（需持久化载体，成本高）；全局开关 + 折叠 view-source 足够。

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
