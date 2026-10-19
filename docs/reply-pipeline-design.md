# Reply Pipeline（回复管线）设计（as-built）

## 目标

把"模型一次生成"升级为"确定性多步管线"：一次用户输入触发一串有序步骤，每步是一次受控的工具调用，前步输出自然进入后步上下文。管线定义随预设携带，工具实现复用全局 `tool_bindings`。

动机：parallel calls 同批互不可见、模型驱动递归顺序/完整性不可靠——顺序必须由编排保证。

## 数据模型

### `oai_settings.reply_pipeline`（预设字段）

```json
{
    "reply_pipeline": {
        "enabled": true,
        "enforce_mode": "auto",
        "result_field": "",
        "steps": [
            { "tool": "analyze", "prompt": "动笔前按约束点分析本轮该写什么" },
            { "tool": "review",  "prompt": "对上面的构思打分并指出改进项" },
            { "tool": "respond", "prompt": "写出正文并附 <plot-options> 选项块" }
        ],
        "final": "respond"
    }
}
```

| 字段 | 说明 |
|---|---|
| `enabled` | 管线开关；关闭则普通生成 |
| `enforce_mode` | `'auto'`（默认，仅注入步提示）/ `'forced'`（每轮发 per-function `tool_choice`） |
| `result_field` | 可选点路径：final 步 result 能 JSON.parse 时从中取正文（默认要求 action 直接 return 字符串） |
| `steps[].tool` | 全局绑定名；未注册/未启用/stealth → 跳过该步 |
| `steps[].prompt` | 该轮注入的步指令文本 |
| `steps[].display` | 卡片显示策略：`summary`（默认折叠）/ `full`（展开）/ `hidden`；final 步默认 `hidden`（显式 display 优先） |
| `steps[].max_tokens` | 可选：覆盖该轮 `max_tokens`（或 `max_completion_tokens`，按模型路径） |
| `steps[].reasoning_effort` | 可选：覆盖该轮 `reasoning_effort`（`auto|low|medium|high|min|max`，经 provider 映射同预设级） |
| `final` | 产出正文的 tool 名；计划在该步截断（其后步骤不可达）；缺省/未知 → 最后一步。步数上限 `MAX_PIPELINE_STEPS`=5 |

持久化：`reply_pipeline` 是 `settingsToUpdate` 字段——随预设保存/应用、随 canonical 设置文档（SQLite `settings_documents`）重载保留；**应用无此键的预设会清除当前管线**（预设权威语义，同 `extensions`）。

## 执行模型

```
用户消息 → GENERATION_STARTED(depth 0) → beginPipelineRun
round i: 请求组装后 (CHAT_COMPLETION_SETTINGS_READY) 注入:
         - 步提示 system 消息（"[Reply pipeline i/N] This round you must call the X tool…"）
         - forced 模式下 tool_choice = {type:'function', function:{name: X}}
         - steps[].max_tokens 覆盖
         → 模型调 X → invoke → role:tool 回写 → preparePipelineRound 决定:
           continue → depth+1 递归（下一轮注入下一步提示）
           final    → final-direct：结果即正文
           fallback → 标记收口轮（删 tools、注入 "不要调用工具" 收口指令）→ 递归一次
```

**按轮门控的预设提示词**：`injection_trigger` 支持 `pipeline:<tool>` 值——该提示词只在对应步驱动的轮次注入（匹配是加法：`all`/`normal` 照常命中，额外步标签只加不减）。步标签经 `getPipelineTriggerTag(type)` 传入提示词组装（非 normal 类型/收口轮返回 null——收口轮没有活动步，步级资料不会泄漏进去）。提示词面板按当前可运行步动态渲染 `管线 <tool>` 复选框。

**步推进语义（前向进展，不回退）**：每轮完成后计划推进到本轮调用中**计划序最靠后**的已匹配步之后——模型并行批量调用、跳步提前产出 final 都被接受；只重调已完成步不会回退计划；本轮无任何步匹配则重发当前步提示。

**runState 卫生**：请求整形只对 `type === 'normal'` 的请求体生效（quiet/generateRaw/连接测试天然免疫残留注入）；步提示对同一 messages 数组只注入一次（重试不重复）；run 在 final-direct、正常收尾（含兜底轮完成/中途放弃）、stealth/空调停、onError 时释放；收口轮若仍收到 tool_calls（不合规上游）则交出管线控制走普通递归。

**final-direct**（正常路径，不跑收口轮）：

- final 步 result 为普通字符串 → 直接用（respond 的 actionBody 应 `return String(args.content)`）
- result 为 JSON 对象 → 仅当配置 `result_field` 时取该字段；`{"ok":true}` 之类绝不当作正文
- 空串 / `error:true` / 该步未调用 → 触发收口轮：**不带 `tools`**（不是 auto）的一次普通生成，用兜底文本收尾
- 收尾动作照抄 onSuccess 尾部语义：`cleanUpMessage`（保留 AI_OUTPUT regex、**跳过 stopping strings**）→ `saveReply`（带 reasoning）→ 打 `extra.reply_pipeline_run/step` 标记 → `saveChatConditional` → `unblockGeneration` → `state.streamingProcessor = null` → 面板刷新 → 返回 `String + messageChunk` 形状

**单点挂钩**：所有请求形态调整集中在 `CHAT_COMPLETION_SETTINGS_READY`（`generate_data` 最终体），不改 `registerFunctionToolsOpenAI` 签名，预算预估/真实请求不分叉。

## 卡片与显示

- **一回合一条消息**：run 期间各轮按 `extra.reply_pipeline_run` 归并进同一张进度卡（实时更新）；`final` 时该卡**折叠进正文消息**——卡消息从 chat 摘除，`mes` = `<section data-pipeline-card>…</section>` + 正文（过程在前、结果在后），`extra.tool_invocations` 挂到 assistant 消息上
- 卡内 markup：`<details data-tool-invocations data-pipeline-run>` + 每步一块 `<div data-tool-invocation data-pipeline-step data-pipeline-display>`（**内层只能是 div**——`data-pipeline-card` 必须是唯一的 section，prompt 剥离正则才能精确命中）；`hidden` 是块级标志；数组参数提升到卡内 `[data-respond-options]` 芯片行
- **prompt 侧**：组装时剥掉 `mes` 开头的 `<section data-pipeline-card>…</section>` 块（openai.js，确定性剥离，兼容旧尾部格式）；回放 = assistant `tool_calls` + `role:tool` 结果 + **正文 assistant 消息**（顺序与真实时序一致）。用户 `promptOnly` 正则先于内置剥离执行——可把 markup 改写成文本摘要再发给模型
- `<plot-options><option>` 这类正文内标记由 **markdownOnly 正则**在渲染时转成 `data-respond-option` 芯片——存进 `mes` 的仍是语义化标记，prompt 侧看到的是文本
- **展示侧**：markup 存在 `mes` 里随消息渲染；写入/合并时过 `getRegexedString(mes, AI_OUTPUT)`，`data-*` 锚点供正则重写/隐藏/重排（`MESSAGE_SANITIZE` 重写 class → `custom-*`，所以钩子全是 `data-*`）
- 兜底轮（final 不可用）走普通消息尾部：进度卡保留为错误证据 + 收口回复是独立消息
- `[data-tool-invocation-text]` max-height 6em 滚动

## 代码落点

| 文件 | 职责 |
|---|---|
| `public/scripts/reply-pipeline-core.js` | 纯逻辑：归一化、步解析、步提示、final 文本抽取 |
| `public/scripts/reply-pipeline.js` | 运行态：run 状态机、`preparePipelineRound`、请求整形、事件挂钩 |
| `public/scripts/generation-service.js` | 两个工具分支插 `preparePipelineRound` + `finalizePipelineReply`（摘卡、折叠进正文）；`GENERATION_STARTED` 补发 `depth` |
| `public/scripts/tool-calling.js` | 进度卡格式化（`data-pipeline-run`/`data-pipeline-step`/`data-pipeline-card` 挂钩）+ runId 归并保存 + AI_OUTPUT regex 通道 |
| `public/scripts/openai.js` | 回放：assistant `tool_calls` + `role:tool` + 正文消息；剥掉 `mes` 尾部 `data-pipeline-card` 段 |
| `chat-message-render-descriptor.js` / `main-chat-store-projection.js` / `message-service.js` | `replyPipelineHidden` 类通道（残留进度卡/兜底卡用） |

## 验证（已落地）

- 单测 `reply-pipeline-core`：归一化（含 final 截断/缺省回落/步数钳制）、步提示、result_field 抽取（含 JSON 标量解包）、findStepCompletion 前向推进
- e2e：`reply_pipeline` 跨重载持久（不再重注入——持久化是承重断言）；3 轮步提示 + final-direct 无第 4 请求；**融合卡**断言（一条 assistant 消息、`mes` 含 `data-pipeline-card` 尾块、`tool_invocations`×3、`data-pipeline-step` 三块、final 块级 hidden、卡内芯片点击、AI_OUTPUT regex 生效、无遗留 runId 卡）；**回放剥离**断言（下一轮请求里该消息回放为 tool_calls+tool 结果+正文且正文不含卡 markup）；后续生成零残留；兜底路径（ok-object → 无 tools/无编号步提示/失败卡留作独立证据消息）
- `test:compat`；`pnpm run lint`；docs:check

## 已知边界

- 线性管线；步数受 `RECURSE_LIMIT`(5) 限制（≤4 步 + 兜底）
- `forced` 模式依赖上游 per-function `tool_choice` 支持（gptl 网关对 `required` 已拒，per-function 待实测）
- 管线编辑器已落地：提示词面板底部「回复管线」区块（行 = 步，`final` 锁定末行，行外字段 `display`/`max_tokens`/`reasoning_effort` 编辑后保留）；正则在 `feature_settings.regex` 手写或经正则面板
