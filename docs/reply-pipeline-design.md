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
| `steps[].tool` | 全局绑定名；未注册/未启用 → 跳过该步 |
| `steps[].prompt` | 该轮注入的步指令文本 |
| `steps[].display` | 卡片显示策略：`summary`（默认折叠）/ `full`（展开）/ `hidden`；final 步默认 `hidden` |
| `steps[].max_tokens` | 可选：该轮覆盖 `max_tokens` |
| `final` | 哪个 tool 是 final 步 |

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

**final-direct**（正常路径，不跑收口轮）：

- final 步 result 为普通字符串 → 直接用（respond 的 actionBody 应 `return String(args.content)`）
- result 为 JSON 对象 → 仅当配置 `result_field` 时取该字段；`{"ok":true}` 之类绝不当作正文
- 空串 / `error:true` / 该步未调用 → 触发收口轮：**不带 `tools`**（不是 auto）的一次普通生成，用兜底文本收尾
- 收尾动作照抄 onSuccess 尾部语义：`cleanUpMessage`（保留 AI_OUTPUT regex、**跳过 stopping strings**）→ `saveReply`（带 reasoning）→ 打 `extra.reply_pipeline_run/step` 标记 → `saveChatConditional` → `unblockGeneration` → `state.streamingProcessor = null` → 面板刷新 → 返回 `String + messageChunk` 形状

**单点挂钩**：所有请求形态调整集中在 `CHAT_COMPLETION_SETTINGS_READY`（`generate_data` 最终体），不改 `registerFunctionToolsOpenAI` 签名，预算预估/真实请求不分叉。

## 卡片与显示

- 每步一轮 → 每步一张 invocation 卡（`saveFunctionToolInvocations` 打 `reply_pipeline_run/step/display`）
- 卡片根为 `<details>` + 一行 summary；`display: full` 展开，`hidden` 由 `replyPipelineHidden` 类 `display:none`（消息留在 chat，回放不受影响——卡片 HTML 不进 prompt）
- `.tool-invocation-text` max-height 6em 滚动；数组参数渲染为 `.respond-option` 芯片（点击填输入框）
- final 步卡片默认 hidden（正文已是 assistant 消息，不重复显示）

## 代码落点

| 文件 | 职责 |
|---|---|
| `public/scripts/reply-pipeline-core.js` | 纯逻辑：归一化、步解析、步提示、final 文本抽取 |
| `public/scripts/reply-pipeline.js` | 运行态：run 状态机、`preparePipelineRound`、请求整形、事件挂钩 |
| `public/scripts/generation-service.js` | 两个工具分支插 `preparePipelineRound` + `finalizePipelineReply`；`GENERATION_STARTED` 补发 `depth` |
| `public/scripts/tool-calling.js` | 卡片 details 化 + 步标记 + 芯片 |
| `chat-message-render-descriptor.js` / `main-chat-store-projection.js` / `message-service.js` | `replyPipelineHidden` 类通道 |

## 验证（已落地）

- 单测 `reply-pipeline-core`：16/16（归一化、final 默认 hidden、result_field、findStepCompletion）
- e2e 新增两条：3 轮步提示 1/3→2/3→3/3 + final-direct（无第 4 请求）+ 卡片 display [summary, summary, hidden] + 隐藏卡 DOM + 后续生成无残留注入；兜底路径（respond 返回 ok-object → 第 3 请求无 tools/tool_choice + 收口指令）
- `test:compat` 94/94；`pnpm run lint` ✓；docs:check 28 篇

## 已知边界

- 线性管线；步数受 `RECURSE_LIMIT`(5) 限制（≤4 步 + 兜底）
- `forced` 模式依赖上游 per-function `tool_choice` 支持（gptl 网关对 `required` 已拒，per-function 待实测）
- v1 无管线编辑器——`reply_pipeline` 在预设 JSON 手写
