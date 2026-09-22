# 非核心模块退役计划（Non-core Feature Retirement Plan）

> 交付给执行开发的任务文档。目标：把 EmberDesk 收敛到「OpenAI 格式单源 + 会话生命周期 + 正则 + 预设 + 角色卡 + 世界书」的最小核心面，剔除全部无关模块。
>
> 本计划与既有退役批次共用同一工作流：**`.docs/tech/feature-retirement-workflow.md`**（R0 收口判定 → R1 引用图谱 → R2 分层删除 → R3 存量归一化 → R4 测试翻转 → R5 门禁 → R6 台账+提交）。每批结束必须按该文件格式补录台账并独立提交。

## 1. 产品边界（验收基准）

**保留的核心需求**：

- 会话：会话、会话编辑、会话管理、重新生成（regenerate/swipe/branch）
- 正则替换（regex 引擎 + 调试器）
- 预设、预设管理（OpenAI 采样预设 + PromptManager 提示词条目化）
- 角色卡（导入/编辑/角色库/头像）
- 世界书（World Info workbench）

**唯一保留的 provider**：`openai`（OpenAI-compatible，`chat_completion_sources` 收敛为单值；custom-url OpenAI-compatible 仍属于该源）。

**关联支撑面（不在本计划删除范围）**：secrets、tokenizers/token-counter、personas、tags、BulkEditOverlay、power-user/settings、媒体管道（`images`/`files`/`avatars`/`image-metadata`/`thumbnails`——角色卡头像与聊天图片依赖它）、backups/content-manager/data-maid、chat/character 导入、connection-manager、STscript 引擎（slash-commands/variables/macros）、`st-context`/`eventSource`/`@sillytavern` 兼容面、users/health/extensions 端点、groups.js 历史数据、既有 410 tombstone routers、reasoning/tool-calling 的 OpenAI 部分。

## 2. 关键已证实事实（R0 前置结论，可直接引用）

- `main_api` 恒为 `'openai'`：`changeMainAPI` 只认识 `'openai'`，启动时无条件 `changeMainAPI('openai')`；legacy 值经 `script.js` 归一化映射。因此 **instruct-mode 是空转引擎**（`power_user.instruct.enabled && main_api !== 'openai'` 永假）。
- Vertex/Horde/NovelAI/NanoGPT/OpenRouter 已退役（`e5c0633c0`、`887cc2780`）；`chat_completion_sources` 当前剩 `openai`/`claude`/`makersuite`。
- 归一化先例：`migrateChatCompletionSettings` 的 migrateMap（`palm→makersuite`、`custom→openai`、`vertexai→makersuite`）。退役 source 用同一表归一化。
- secrets 存取按 key 存在性校验而非枚举白名单——**删除 SECRET_KEYS 条目不影响存量 secrets.json 的可读可删**。
- JS-Slash-Runner（`public/scripts/extensions/third-party/`）是 vendored 契约源，**禁止修改**；其内部对已退役 provider/字段的引用会自然降级（枚举取到 `undefined`）。
- 410 tombstone 先例：`src/endpoints/{provider,vector,group-chat,moving-ui,stats}-retirement.js` + `tests/provider-retirement-express-route.test.js`。

## 3. 删除范围清单（无关模块全集）

### 3.1 Provider 类（最大手术面）

| 目标 | 删除内容 |
|---|---|
| **claude** | `chat_completion_sources.CLAUDE`；`chat-completions.js` 的 `sendClaudeRequest` + status 分支 + switch case；`openai.js` 的 claude 模型/源分支（`claude_model`、`model_claude_*` datalist、`saveModelList` claude 块、prompt 处理 claude 分支）；`secrets.js` 前端 `api_key_claude` 键/标签/选择器 + `src/endpoints/secrets.js` `CLAUDE` 枚举；reasoning/tool-calling/tokenizers 的 claude 路径；ApiConnectionsPanel/SettingsSurface 的 claude 控件与 settings-helpers 映射；`prompt-converters.js` 的 claude 转换路径（若有）；相关 slash 命令分支 |
| **makersuite**（Google AI Studio） | `chat_completion_sources.MAKERSUITE`；`src/endpoints/google.js`（makersuite-only 助手——provider 退役后整文件可删）；`chat-completions.js` 的 `sendMakerSuiteRequest` + status 分支；`GEMINI_SAFETY` 常量；`convertGooglePrompt`/`prompt-converters.js` 的 google 路径；`google_model`/`model_google_*` 全链；`api_key_makersuite` 键；reasoning 的 Gemini thought-signature、tokenizer 的 gemini 选择、tool-calling makersuite 项；UI 控件与 settings 映射；`flattenSchema` 的 makersuite 项 |
| **归一化** | migrateMap 增加 `claude→openai`、`makersuite→openai`；React form 的 `mapChatCompletionSourceToFormValue` 同步扩为三者→`openai`（或直接随单源简化掉） |
| **单源简化** | `#chat_completion_source` 下拉收敛为单项或整体隐藏；`chat-completion-select`/`api-configuration` 语义文档改写；评估 `chatCompletionSource` 字段是否仍需进 settings schema（建议保留字段、固定 `'openai'`，避免存量 payload 结构突变） |

**Provider 批注意点**：

- `flattenSchema`、reasoning effort、tool-calling 的 OpenAI 路径必须原样保留。
- `convertGooglePrompt` 若被通用管线引用，删前确认调用点全部随 makersuite 分支消失。
- claude 的 `use_sysprompt`/system-prompt 处理若与 openai 共享代码路径，只删 claude 专属分支。
- 删后 `chat_completion_source` 未知值由现有 400 兜底覆盖，无需 410（与 vertexai 同判例）。provider-retirement router 是否扩到 `/api/backends/chat-completions` 下不存在专属路由——无需新增。

### 3.2 instruct-mode（空转引擎）

- **删**：`public/scripts/instruct-mode.js` 整文件；`power_user.instruct.*` 的设置绑定/UI 控件/滑条；`script.js` 的 `isInstruct` 判定与其下游分支（instruct 模板拼接、`<START>` 头、stop sequences 路径）；`PromptManager`/`power-user.js` 里 instruct 预设选择器与编辑入口；instruct 相关 slash 命令/宏；instruct CSS。
- **保留**：`power_user.instruct` 存量键不动（惰性历史数据）；settings-react 的 instruct 字段绑定与 schema 同步删除，存量值随 untouched 保留。
- **注意**：instruct-mode 的 UI 与 PromptManager/power-user 共享面板接线，按「剥离接线再删模块」处理，不要误删 PromptManager 本体（chat-completion 预设管理仍用它）。

### 3.3 扩展/前端独立面

| 目标 | 删除内容 | 风险点 |
|---|---|---|
| **quick-reply** | `public/scripts/extensions/quick-reply/` 整目录；`src/endpoints/quick-replies.js` router → 410 tombstone（若被外部调用）或整删；`extension_settings.quickReply` 默认值 | **`/qr*` slash 命令族是第三方契约面**：需按 authors-note 先例留最小 stub（命令注册保留、回执"功能已移除"）或整删并在台账记录破坏面——R0 时定夺，倾向 stub |
| **audio-player** | `audio-player.js` + 消息音频播放 UI 接线 + CSS | 检查 `extra.media`/消息附件音频预览是否复用其播放器组件——若复用则只删独立面板 |
| **logprobs** | `logprobs.js` + `use_logprobs` 设置 + `top_logprobs` 请求字段接线 + logprob 查看 UI | 请求字段是纯加法分支，删后 openai 请求不再带 logprobs |
| **itemized-prompts** | `itemized-prompts.js` + 入口按钮 + 面板 markup | 纯查看器，低耦合 |
| **welcome-screen** | `welcome-screen.js` + 欢迎页 markup/样式 + 启动钩子 | 检查首启引导是否依赖它（`firstRun` 路径） |
| **logit-bias** | `logit-bias.js` + logit bias 编辑器 + preset 字段 | OpenAI 请求的 `logit_bias` 字段同步从构建管线删 |
| **scrapers** | `scrapers.js` 内置 scraper 注册 + fetch-web-content 类 slash 命令 | **`ScraperManager` 注册表保留**（`st-context` 暴露的第三方契约）；只删内置实现与 UI 入口 |
| **themes** 端点 | `src/endpoints/themes.js` + 主题上传 UI + settings 里的自定义主题项 | 检查 theme 下拉是否混在内置主题列表里 |
| **search** 端点 | `src/endpoints/search.js` + 全局搜索 UI 入口 | 确认聊天列表搜索是否走该端点（若走则只删跨域搜索） |
| **classify** 端点 | `src/endpoints/classify.js` + 消费者 | 先 grep 消费者；若无前端引用可整删 |

## 4. 建议批次顺序（低耦合先行）

```
B-cut-12a  claude provider 退役
B-cut-12b  makersuite/google provider 退役 + 单源收敛
B-cut-13   instruct-mode 空转引擎退役
B-cut-14a  logit-bias / logprobs / itemized-prompts / audio-player（生成管线的查看器面）
B-cut-14b  scrapers / themes / search / classify（端点面）
B-cut-14c  welcome-screen（启动面）
B-cut-15   quick-reply 压轴（/qr* stub 裁决后）
```

每批独立提交、独立台账条目。批次可合并执行但**不允许跨批混提交**。

## 5. 每批强制步骤（R-loop 摘要）

1. **R0 收口判定**：写清兼容面（slash/context/DOM id/`@sillytavern` 导入）、数据足迹、端点形状（存量可达→410 tombstone / 纯内部→整删）、删除形状。
2. **R1 引用图谱**：`rg` 全库扫目标符号的所有 import/DOM id/事件名，区分「删」「留」「stub」。
3. **R2 分层删除**：固定层序 UI → 行为 → 服务 → 端点 → 注册。
4. **R3 存量归一化**：settings/secret/数据文件只归一化活跃读取键；历史键惰性保留。
5. **R4 测试翻转**：钉死旧行为的断言改为钉死新契约；引用被删文件的测试改指存活面或删除。
6. **R5 门禁**（缺一不可）：
   ```bash
   pnpm run lint            # eslint + tsc
   pnpm run test:unit       # 聚焦先行，再全量
   pnpm run test:integration
   pnpm run test:compat     # 第三方扩展/导入面契约
   pnpm run build:react && pnpm run build:react:workspace-panels && pnpm run build:react:character-library
   pnpm --dir tests run test:e2e <相关文件>.e2e.js
   pnpm run docs:build      # 改了 .docs/db 后必跑
   ```
7. **R6**：台账补录（删除面/保留面/数据策略/行为差异/验证/commit hash）+ 语义文档（`.docs/db`）同步 + 按仓库 commit 风格提交。

## 6. 全局红线

- **不动** `public/scripts/extensions/third-party/`（JS-Slash-Runner vendored 源）。
- **不动** `main_api`/`chat_completion_source` 的存量归一化路径；新增退役 source 一律走 migrateMap。
- **不删** 磁盘上的存量 secrets/settings 键——只删活跃读取者与枚举条目。
- **不降** CSRF/whitelist/host/SSRF/proxy 防护；不动 Express 中间件顺序。
- 保留 `@sillytavern/*` 导入面：删模块前先 grep 第三方导入，命中即留最小 stub。
- 410 tombstone 仅用于**曾被外部直接调用的端点**；共享后端内的 source 值靠 400 兜底，不设 tombstone。
- 提交信息沿用 `feat(retirement): ...` / `test(retirement): ...` / `docs(retirement): ...` 前缀。

## 7. 完成定义

- 无关清单内模块代码全部移除（或按裁决转为 stub/tombstone）。
- `chat_completion_sources` 收敛为 `{ OPENAI: 'openai' }`。
- 全部门禁通过；`.docs/db` 语义文档与代码一致；台账条目完整含 commit hash。
- 最终独立 code review 通过后宣布退役阶段收官。
