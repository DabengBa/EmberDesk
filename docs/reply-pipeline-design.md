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
| `steps[].model` | 可选模型名，空白继承预设；恢复 provider 模型优先，收尾轮使用预设模型 |
| `steps[].display` | 卡片显示策略：`summary`（默认折叠）/ `full`（展开）/ `hidden`；final 步默认 `hidden`（显式 display 优先） |
| `steps[].max_tokens` | 可选：覆盖该轮 `max_tokens`（或 `max_completion_tokens`，按模型路径） |
| `steps[].reasoning_effort` | 可选：覆盖该轮 `reasoning_effort`（`auto|low|medium|high|min|max`，经 provider 映射同预设级） |
| `final` | 产出正文的 tool 名；计划在该步截断（其后步骤不可达）；缺省/未知 → 最后一步。步数上限 `MAX_PIPELINE_STEPS`=5 |

持久化：`reply_pipeline` 是 `settingsToUpdate` 字段——随预设保存/应用、随 canonical 设置文档（SQLite `settings_documents`）重载保留；**应用无此键的预设会清除当前管线**（预设权威语义，同 `extensions`）。

## 执行模型

每次请求构造前解析实际模型，stream 消费与请求体采用同一模型。首个可执行步骤的模型决定历史媒体装配；之后固定前缀不重建，因此混合模型及恢复模型的媒体能力差异不会改变该前缀。检查器使用同样规则且不修改运行态。明确不支持工具的模型报错，未知模型不因缺乏元数据被拒绝。

步骤专属提示在该步骤首次尝试时以当时实际模型正常展开一次并保存快照；重试即使改用备用模型，请求模型会改变，提示中的 `{{model}}` 仍是首次模型，其他宏及副作用也不重新执行。已完成步骤和共享前缀保持不变。

```
用户消息 → GENERATION_STARTED(depth 0) → beginPipelineRun
round i: 请求组装后 (CHAT_COMPLETION_SETTINGS_READY) 注入:
         - 步提示 system 消息（"[Reply pipeline i/N] This round you must call the X tool…"）
         - forced 模式下 tool_choice = {type:'function', function:{name: X}}
         - steps[].max_tokens 覆盖
         → 模型调 X → invoke → role:tool 回写 → preparePipelineRound 决定:
           continue → depth+1 递归（下一轮注入下一步提示）
           final    → final-direct：结果即正文
           fallback → 标记收口轮（保留 tools、tool_choice=none、注入 "不要调用工具" 收口指令）→ 递归一次
```

**按轮门控的预设提示词**：`injection_trigger` 支持 `pipeline:<tool>` 值——该提示词在对应步驱动时追加，随后保留在运行前缀中（`all`/`normal` 基础资料只捕获一次）。步标签经 `getPipelineTriggerTag(type)` 传入提示词组装（非 normal 类型/收口轮返回 null——收口轮没有活动步，不新增步级资料，既有前缀保留）。提示词面板按当前可运行步动态渲染 `管线 <tool>` 复选框。

**步推进语义（逐步执行，不跳步）**：每轮只允许当前步执行一次；提前调用后续步、重复调用当前步、调用已完成步或无关工具都返回拒绝结果，不执行 action。非法调用报错并释放运行态；没有工具调用的普通正文走正常完成尾部。

**运行内前缀稳定**：首轮捕获基础上下文，后续轮只追加步级资料、指令、原生 assistant `tool_calls` 和配对 `tool` 结果；不从聚合 UI 卡重建运行中历史。工具定义及顺序整轮固定，收口轮仅将 `tool_choice` 改为 `none`。基础上下文超出预算时明确报错，不静默裁剪。此处保证请求形状，不保证上游缓存命中。

**runState 卫生**：请求整形只对 `type === 'normal'` 的请求体生效（quiet/generateRaw/连接测试天然免疫残留注入）；每轮步提示只追加一次（重试不重复）；run 在 final-direct、正常收尾（含兜底轮完成/中途放弃）、stealth/空调停、onError 时释放；收口轮若仍收到 tool_calls（不合规上游）则拒绝执行并报错清理。

**final-direct**（正常路径，不跑收口轮）：

- final 步 result 为普通字符串 → 直接用（respond 的 actionBody 应 `return String(args.content)`）
- result 为 JSON 对象 → 仅当配置 `result_field` 时取该字段；`{"ok":true}` 之类绝不当作正文
- 空串 / `error:true` / 该步未调用 → 触发收口轮：保留工具定义但 `tool_choice: 'none'` 的一次普通生成，用兜底文本收尾
- 收尾动作照抄 onSuccess 尾部语义：`cleanUpMessage`（保留 AI_OUTPUT regex、**跳过 stopping strings**）→ `saveReply`（带 reasoning）→ 打 `extra.reply_pipeline_run/step` 标记 → `saveChatConditional` → `unblockGeneration` → `state.streamingProcessor = null` → 面板刷新 → 返回 `String + messageChunk` 形状

**单点挂钩**：所有请求形态调整集中在 `CHAT_COMPLETION_SETTINGS_READY`（`generate_data` 最终体），不改 `registerFunctionToolsOpenAI` 签名，预算预估/真实请求不分叉。

## 卡片与显示

- **一回合一条消息**：run 期间各轮按 `extra.reply_pipeline_run` 归并进同一张进度卡（实时更新，`<details data-pipeline-run>` markup）；`final` 时该卡**折叠进正文消息**——卡消息从 chat 摘除，`mes` = **转义语义标签文本**（每步一段 `&lt;{tool}&gt;内容&lt;/{tool}&gt;`，如 `&lt;analyze&gt;…&lt;/analyze&gt;&lt;review&gt;…&lt;/review&gt;&lt;respond&gt;正文&lt;/respond&gt;`），`extra.tool_invocations` 挂到 assistant 消息上
- **为什么是转义标签**：标签定界符存成 `&lt;`/`&gt;` 实体 → 消息把标签名**当字面文本显示**（裸未知元素会被 DOMPurify 吃掉、几段正文糊在一起）。没有正则时用户直接看到 `<analyze>xx</analyze>` 原始包裹文本——零 JSON、零卡片 chrome
- **末标签即正文**：最后一步（通常是 respond/final）的 tag 里放**原生回复文本**——`<plot-options>` 这类正文内标记保持活体，markdownOnly 正则照旧渲染成 `data-respond-option` 芯片；选项芯片行（数组参数提升）也塞在末标签内。前面步的内容整体转义存字面文本
- **正则锚点**：写入时 `getRegexedString(mes, AI_OUTPUT)` 跑在完整 markup 上；markdownOnly 规则按 `&lt;tag&gt;` 实体匹配做样式/隐藏/折叠（demo：`analyze→折叠块`、`review 加高亮边`、`隐藏 analyze 块`）；promptOnly 规则可把步骤块改写成文本摘要再发给模型
- **prompt 侧**：运行中使用独立追加日志，不回放聚合卡；已完成的纯管线消息在后续用户轮剥掉前面步骤标签、解包末标签并剥掉芯片行，得到当前有效正文，再按下节规则投影。混有普通工具调用的消息仍保留结构化配对回放。
- 兜底轮（final 不可用）走普通消息尾部：进度卡保留为错误证据 + 收口回复是独立消息
- `[data-tool-invocation-text]` max-height 6em 滚动（运行中进度卡）

## 历史输入与工具输出

普通生成存在可运行管线、且首轮实际模型支持工具时，旧用户消息和旧助手正文统一投影成 `submit_story({content: 正文})` 调用，紧随 `已收到。` 的工具回执；最新一条真实用户输入保持 `user`。这与当前管线开关联动，不新增独立的输入/输出开关。

以下仅展示历史片段；系统提示、当前步指令和真实工具定义仍由原有组装流程提供：

```json
[
    {"role": "user", "content": "以下是此前已经发生的对话。"},
    {
        "role": "assistant",
        "tool_calls": [{
            "id": "pipeline-history-1",
            "type": "function",
            "function": {"name": "submit_story", "arguments": "{\"content\":\"我推开门。\"}"}
        }]
    },
    {"role": "tool", "tool_call_id": "pipeline-history-1", "content": "已收到。"},
    {
        "role": "assistant",
        "tool_calls": [{
            "id": "pipeline-history-2",
            "type": "function",
            "function": {"name": "submit_story", "arguments": "{\"content\":\"房间里亮着一盏灯。\"}"}
        }]
    },
    {"role": "tool", "tool_call_id": "pipeline-history-2", "content": "已收到。"},
    {"role": "user", "content": "我走近那盏灯。"}
]
```

- **真实执行记录**：`extra.tool_invocations` 保留原始参数、结果及管线元数据；本次运行后续步骤仍读取真正的工具调用和结果。
- **有效正文**：读取当前 `mes` 的 prompt 处理结果，不从旧 invocation 的参数/结果恢复正文。因此编辑后的回复在下一轮生效，中间分析和芯片不会作为最终正文重复发送。
- **请求历史表示**：仅在预算组装时生成以上配对，不写回聊天、不注册或执行 `submit_story`。调用 ID 在同一历史内可重复生成且避开真实调用 ID；预算包含两条消息和回执 ID，要么整对保留，要么整对裁掉。历史开头是调用时，像示例一样添加并预留一条用户提示，避免服务端再补入未计数的占位消息。Completion 名称模式将清洗后的发言者名称保留在正文中；Content 模式沿用已添加的名称，不重复添加。

系统/旁白、注入提示、记忆摘要、媒体、带 reasoning 的消息及真实普通/混合工具记录不转换。已结束但未成为正文的纯管线系统进度卡不作为历史正文发送。最后一条真实用户输入的识别不受 user-role 注入提示影响。

本轮输出继续调用预设配置的最后一步（例如 `respond`），通过既有 final-direct 路径形成正常可见回复；不要求把自定义工具重命名为 `submit_story`。首步提示明确历史提交无需重新执行。`auto`/`forced`、普通文本提前完成及最终结果不可用时的收口轮语义不变。

检查器（包括收口轮预览）与真实首轮使用相同历史投影。运行中捕获过的前缀不重新投影；重试/后续步只追加运行日志。关闭管线、没有可运行步骤、非 normal 请求或首轮模型不支持工具时，不启用历史投影。

## 代码落点

| 文件 | 职责 |
|---|---|
| `public/scripts/reply-pipeline-core.js` | 纯逻辑：归一化、步解析、步提示、final 文本抽取 |
| `public/scripts/reply-pipeline.js` | 运行态：run 状态机、`preparePipelineRound`、请求整形、事件挂钩 |
| `public/scripts/generation-service.js` | 两个工具分支插 `preparePipelineRound` + `finalizePipelineReply`（摘卡、折叠进正文）；`GENERATION_STARTED` 补发 `depth` |
| `public/scripts/tool-calling.js` | 进度卡格式化（`data-pipeline-run`/`data-pipeline-step` 挂钩）+ `formatPipelineTagMarkup`（终态语义标签）+ runId 归并保存 + AI_OUTPUT regex 通道 |
| `public/scripts/openai.js` | 有效正文清理、预算内的历史 `submit_story` 配对投影、真实工具的结构化回放；逐步剥 `&lt;tool&gt;` 块/解包末标签/剥芯片行（旧 `data-pipeline-card` 段兼容剥离） |
| `chat-message-render-descriptor.js` / `main-chat-store-projection.js` / `message-service.js` | `replyPipelineHidden` 类通道（残留进度卡/兜底卡用） |

## 验证（已落地）

- 单测 `reply-pipeline-core`：归一化（含 final 截断/缺省回落/步数钳制）、步提示、result_field 抽取（含 JSON 标量解包）、findStepCompletion 前向推进
- `reply-pipeline-assembly`：旧用户与当前正文配对投影、当前 user 保留、原始记录不变、排除边界、模型切换、ID 冲突、整对预算边界，以及真实 tokenizer 计数约定下的裁剪与发送一致性
- e2e：`reply_pipeline` 跨重载持久（不再重注入——持久化是承重断言）；3 轮步提示 + final-direct 无第 4 请求；**融合标签**断言（一条 assistant 消息、`mes` 含 `&lt;analyze&gt;`/`&lt;review&gt;`/`&lt;respond&gt;` 转义标签块且顺序正确、无 `data-pipeline-card`、DOM 显示字面标签文本、`tool_invocations`×3、芯片可点、AI_OUTPUT regex 生效于标签 markup、无遗留 runId 卡）；**下一轮历史**断言（管线开启时旧用户与编辑后的正文各投影一次，检查器与真实请求一致，不含中间分析/旧参数正文/芯片；管线关闭后仍为普通文本）；后续生成零残留；兜底路径（ok-object → 固定 tools + tool_choice none/无编号步提示/失败卡留作独立证据消息）
- `test:compat`；受影响文件 ESLint；`docs:check`

## 已知边界

- 线性管线；步数受 `RECURSE_LIMIT`(5) 限制（≤4 步 + 兜底）
- `forced` 模式依赖上游 per-function `tool_choice` 支持（gptl 网关对 `required` 已拒，per-function 待实测）
- 管线编辑器已落地：提示词面板底部「回复管线」区块（行 = 步，`final` 锁定末行，行外字段 `display`/`max_tokens`/`reasoning_effort` 编辑后保留）；正则在 `feature_settings.regex` 手写或经正则面板
