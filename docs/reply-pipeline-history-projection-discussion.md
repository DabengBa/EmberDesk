# Reply Pipeline：跨轮历史投影讨论

记录日期：2026-11-12。

状态：§1–7 为历史讨论，内含早期实现快照；§8–9 描述已实现的服务端文字请求布局。现行实现以 [Reply Pipeline as-built](reply-pipeline-design.md) 为准。

## 1. 讨论的问题

一轮用户输入可以触发 `analyze → respond` 等多个工具步骤。下一轮输入到来时，模型究竟应该看到：

1. 所有真实工具调用及结果；
2. 一条普通 assistant 最终回复（当前实现）；
3. 仅最后一次真实工具调用及结果；
4. 代表整轮管线的一次合成工具调用及最终结果。

这里的“投影”只指**发送给模型的历史表示**，不是重新执行工具，也不等于改写持久化记录或 UI 展示。

## 2. 已确认的现状

### 本轮执行

- 管线按步骤追加指令，例如 `[Reply pipeline 1/2] This round you must call the analyze tool exactly once.`。
- 默认 `enforce_mode: auto` 依靠指令；`forced` 才设置指向当前工具的 `tool_choice`。普通文本且没有工具调用的响应可以结束运行，因此不能把默认模式描述为 API 层强制调用。
- 运行内保留真实的 assistant 工具调用和配对工具结果，后续步骤可以读取前面步骤的输出。
- 非当前步骤、重复或不合法的调用被拒绝执行。
- 正常 final-direct 路径直接把最后一步可用结果作为回复，不再额外调用模型转述；无可用结果才走收口轮。

### 保存与下一轮请求

- 正常完成后，一条 assistant 消息的 `mes` 保存各步骤的转义语义标签文本，`extra.tool_invocations` 保留调用元数据。
- 下一用户轮装配 prompt 时，**已结束的纯管线消息**剥掉前面步骤、解包最后一步，作为普通 assistant 文本发送；不重放它的 `tool_calls` / `role: tool`。
- 混有普通工具调用的消息不适用这条纯管线折叠规则；活动运行、兜底或放弃后的独立卡片也需要按各自路径分析，不能笼统声称所有历史都只剩一条最终回复。
- 关闭管线后，不再为后续生成提供新工具定义；已经完成的普通最终回复仍可进入历史。

代码依据：

- `public/scripts/reply-pipeline-core.js:115–149`：步骤指令和强制调用整形。
- `public/scripts/reply-pipeline.js:167–175`、`public/scripts/reply-pipeline.js:245–287`：运行内追加调用/结果及固定前缀。
- `public/scripts/generation-service.js:1153–1207`：final-direct 收尾。
- `public/scripts/openai.js:331–358`、`public/scripts/openai.js:606–626`、`public/scripts/openai.js:677–710`：文本清理、纯管线折叠和普通工具回放。
- `public/scripts/tool-bindings-core.js:95–120`：自动生成的文本绑定接收 `content:string`，直接返回 `args.content`，不是 JSON.stringify 包装后的字符串。

相关现有测试：`tests/reply-pipeline-runtime.test.js`、`tests/prompt-inspector.e2e.js`、`tests/tool-bindings.e2e.js`。本次记录只阅读源码和测试，没有重跑这些测试。

## 3. 与 Codex / OpenCode / Pi 的对照

此前源码调查的结论是：这些 coding agent 通常会把上一轮真实调用、工具结果和后续 assistant 回复继续放入模型上下文，直到裁剪、压缩、分支选择或其他上下文处理改变它。

这与 EmberDesk“每轮完成后主动折叠纯管线记录”的策略不同，但不意味着每次网络请求都完整重发：有些传输使用增量会话。各 provider 的字段也不同：

- OpenAI Chat Completions：`assistant.tool_calls` + `role: tool`。
- OpenAI Responses：`function_call` + `function_call_output`。
- Anthropic：`tool_use` + `tool_result` 内容块。
- Pi 内部：assistant `toolCall` 内容块 + `toolResult` 消息，再由适配器转换。

这些项目不会自动添加 EmberDesk 的 `[Reply pipeline ...]` 指令。本文后面的例子用 OpenAI Chat Completions 记法说明语义，不保证所有 provider 使用相同 JSON。

调查来源：

- [Codex context history](https://github.com/openai/codex/blob/1b7c0252586f3701493bb7c9331290c06346b842/codex-rs/core/src/context_manager/history.rs)。
- [OpenCode history-to-model conversion](https://github.com/anomalyco/opencode/blob/b451fe3952b649881d13e9c3534edb61c2767b8e/packages/core/src/session/runner/to-llm-message.ts)。
- 本地 Pi 1.5.1 的 `@earendil-works/pi-coding-agent/dist/core/messages.js`、`dist/core/session-manager.js` 及 `@earendil-works/pi-ai/dist/api/` provider 适配器。

## 4. 候选 A：只回放最后一次真实 respond

```text
实际执行：analyze 调用 + 结果 → respond 调用 + 结果
历史投影：                   respond 调用 + 结果
```

例如上一轮最终回复是“周六去爬山，周日在家休息。”，下一轮历史中保留：

```json
[
  {
    "role": "assistant",
    "tool_calls": [{
      "id": "call_respond_1",
      "type": "function",
      "function": {
        "name": "respond",
        "arguments": "{\"content\":\"周六去爬山，周日在家休息。\"}"
      }
    }]
  },
  {
    "role": "tool",
    "tool_call_id": "call_respond_1",
    "content": "周六去爬山，周日在家休息。"
  }
]
```

- 复用真实调用的名称、参数和 ID，不需要虚构执行过程。
- 不再额外追加一条内容相同的普通 assistant 回复。
- 对当前自动生成的文本绑定，正文会在参数和结果里各出现一次，因此比普通文本历史更长。
- 最后一步不一定叫 `respond`，必须跟随实际 final；自定义 action、`result_field` 和正文后处理还可能使参数、原始结果、用户可见回复不一致。

## 5. 候选 B：合成一次代表整轮的调用

```text
实际执行：analyze 调用 + 结果 → respond 调用 + 结果
历史投影：pipeline_reply({}) → 最终回复
```

`pipeline_reply` **只是讨论中假设的历史表示，不是现有工具，也没有真的额外执行过一次**：

```json
[
  {
    "role": "assistant",
    "tool_calls": [{
      "id": "history_round_1",
      "type": "function",
      "function": { "name": "pipeline_reply", "arguments": "{}" }
    }]
  },
  {
    "role": "tool",
    "tool_call_id": "history_round_1",
    "content": "周六去爬山，周日在家休息。"
  }
]
```

正文只出现一次，而且位于工具**结果**中。代价是：历史不再是执行日志，而是一种合成摘要；模型对“我说过的话”和“工具提供的资料”的理解可能不同，需要明确结果已展示给用户，但不能据此保证效果更好。

不能只留下孤立的 `role: tool`；必须配对调用和结果。也不能直接把真实 `respond` 的参数清空后声称忠实回放，因为当前默认绑定要求 `content`。

## 6. 多轮示例

以下省略基础 system、工具定义和当前轮管线指令。它们仍由正常请求装配负责；历史回放本身不会再次执行工具，也不需要反复注入旧轮次的步骤指令。

### 第一轮

```text
user₁：帮我安排周末，周六想出门，周日想休息。
本轮：analyze → respond
用户看到的最终回复₁：周六去爬山，周日在家休息。
```

### 第二轮请求（以候选 B 表示历史）

```text
user₁：帮我安排周末，周六想出门，周日想休息。
assistant.tool_calls：pipeline_reply({})，id = history_round_1
tool：周六去爬山，周日在家休息。 [tool_call_id = history_round_1]
user₂：周六会下雨，换个室内活动。
```

第二轮继续执行新的 `analyze → respond`，回复：“那就周六去博物馆，周日在家休息。”

### 第三轮请求

```text
user₁：帮我安排周末，周六想出门，周日想休息。
assistant.tool_calls：pipeline_reply({})，id = history_round_1
tool：周六去爬山，周日在家休息。 [tool_call_id = history_round_1]

user₂：周六会下雨，换个室内活动。
assistant.tool_calls：pipeline_reply({})，id = history_round_2
tool：那就周六去博物馆，周日在家休息。 [tool_call_id = history_round_2]

user₃：周日也安排一个轻松的活动吧。
```

第三轮再运行自己的管线。每个旧轮次只有一组工具调用/结果，不含 `analyze`。

候选 A 的多轮顺序完全相同，只是每个 `pipeline_reply({})` 替换为该轮真实的 `respond({content: 最终正文})`，ID 使用真实调用 ID。当前策略则把每组调用/结果替换为一条普通 assistant 最终回复。

## 7. 当前结论与未决问题

已确认：

- “整轮压成一次工具调用”在表示上可行，但一次调用通常对应两条消息，不等于只发一条工具结果。
- 执行历史、持久化数据、用户界面和发给模型的历史投影应分别讨论。
- A 是删减真实历史；B 是合成历史。两者不能混称为保留完整真实调用。
- 本次没有选定替代现有策略，也没有授权或实施运行时改造。

未决问题：

1. 正文应位于调用参数还是工具结果？两种位置的作者归属不同，不能只按 token 数判断。
2. 若采用合成调用，工具名称、描述、声明方式，以及不支持工具的模型、管线关闭后的回放如何处理？
3. 原始 final 结果、`result_field` 抽取结果、正则处理后的显示文本、手工编辑后的文本，谁是历史投影正文？
4. 工具错误、收口回复、混合普通工具调用、重新生成/分支、删除/编辑、媒体和上下文裁剪如何保留正确的配对与内容？
5. 是否真的改善后续回复质量、格式遵循或成本？当前没有跨模型实验或性能结论；后续若实施，用聚焦单测和真实请求检查验证，不先引入额外治理机制。

本次只记录候选设计，没有用户可见行为变更，因此不修改 `.docs/db` 已交付功能语义。

当时对照的 [dsh-tavern 历史投影实现](https://github.com/flizzywine/dsh-tavern/blob/36f07bcfc4817a83d5f58180b91335fa2f1854a9/tavern-plugin/lib/domain/history-tool-call.js) 启发了候选 C：将正文放在合成提交调用的参数中，工具结果只保留简短回执。该候选在这一阶段尚未选定；后续实现见 §8。

## 8. 全量工具投影：完整首轮请求示例

这个服务端文字布局借鉴 dsh-tavern `everything` 对本轮输入的处理，并把预设提示、角色卡描述、命中的世界书条目和历史摘要放入合成调用。请求从 `assistant.tool_calls` 开始，不发 `user` 引导，也没有开头的 `system`；首轮的 `system` 消息在末尾，负责解释这些记录并给出当前步骤指令。原生媒体继续使用 multipart。以下使用便于阅读的 ID 和简化后的工具 schema。实际顺序由预设及注入位置决定；按深度注入的世界书也可能位于本轮输入之后。

`POST /v1/chat/completions` 请求体（管线第 1 步，共 2 步）。为突出摘要拆分，示例只列出两个已摘要轮次和最近原文的片段：

```json
{
  "model": "gpt-4.1-mini",
  "temperature": 0.7,
  "max_tokens": 512,
  "stream": true,
  "messages": [
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_ctx_1",
        "type": "function",
        "function": {
          "name": "story_preset",
          "arguments": "{\"kind\":\"system\",\"content\":\"用第二人称叙述。通过动作和感官细节推进剧情，不替玩家决定行动。\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_ctx_1", "content": "已收到。"},
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_ctx_2",
        "type": "function",
        "function": {
          "name": "character_card",
          "arguments": "{\"kind\":\"system\",\"content\":\"伊芙是旧城档案员。说话简短，遇到危险会先观察出口。她知道密室的来历，但不愿主动提起。\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_ctx_2", "content": "已收到。"},
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_ctx_3",
        "type": "function",
        "function": {
          "name": "world_info",
          "arguments": "{\"kind\":\"system\",\"content\":\"蓝灯表示通道安全；红灯亮起后，门锁会在十秒内落下。\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_ctx_3", "content": "已收到。"},
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_story_history_turn_1",
        "type": "function",
        "function": {
          "name": "story_history",
          "arguments": "{\"kind\":\"system\",\"content\":\"你和伊芙在旧城档案馆的地下地图上发现了一间未登记的密室。\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_story_history_turn_1", "content": "已收到。"},
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_story_history_turn_2",
        "type": "function",
        "function": {
          "name": "story_history",
          "arguments": "{\"kind\":\"system\",\"content\":\"你和伊芙循图找到密室入口。她让你留意门内的信号灯。\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_story_history_turn_2", "content": "已收到。"},
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_ctx_5",
        "type": "function",
        "function": {
          "name": "submit_story",
          "arguments": "{\"kind\":\"user\",\"content\":\"我推开门，往里看。\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_ctx_5", "content": "已收到。"},
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_ctx_6",
        "type": "function",
        "function": {
          "name": "submit_story",
          "arguments": "{\"kind\":\"assistant\",\"content\":\"门里亮着一盏蓝灯。伊芙停在门槛外，没跟进来。\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_ctx_6", "content": "已收到。"},
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_ctx_7",
        "type": "function",
        "function": {
          "name": "submit_story",
          "arguments": "{\"kind\":\"user\",\"content\":\"我走近蓝灯，问伊芙：你为什么不进来？\"}"
        }
      }]
    },
    {"role": "tool", "tool_call_id": "call_ctx_7", "content": "已收到。"},
    {
      "role": "system",
      "content": "[Reply pipeline 1/2] 以上合成调用是已提供的上下文，不要重复调用。调用 ID 为 call_ctx_7 的 submit_story 是本轮玩家输入。本轮只调用一次 analyze：结合伊芙的设定和信号灯规则，构思如何回应玩家的问题，不写正式正文。"
    }
  ],
  "tools": [{
    "type": "function",
    "function": {
      "name": "analyze",
      "description": "提交本轮的剧情接续构思，不提交正式正文。",
      "parameters": {
        "type": "object",
        "properties": {"content": {"type": "string"}},
        "required": ["content"],
        "additionalProperties": false
      }
    }
  }, {
    "type": "function",
    "function": {
      "name": "respond",
      "description": "提交本轮给玩家看的正文。",
      "parameters": {
        "type": "object",
        "properties": {"content": {"type": "string"}},
        "required": ["content"],
        "additionalProperties": false
      }
    }
  }],
  "tool_choice": {"type": "function", "function": {"name": "analyze"}}
}
```

每条合成调用用独立 ID，后面紧跟同 ID 的 `tool` 回执；正文只放在 `function.arguments` 的 JSON 字符串里。这些调用不执行、不写回聊天，也不列入本轮 `tools`。本轮真正要生成的是 `analyze` 调用。预设中的模型、温度等请求参数仍在请求顶层，不放进 `story_preset`。

每个已摘要轮次各用一组 `story_history` 调用和回执，放在它所替换的原文位置。示例 ID 的轮次后缀仅方便阅读；实际投影应使用已有的稳定轮次标识，而不是当前请求里的顺序。新增一个摘要时，不改写先前摘要的 ID 或参数。

## 9. 全量工具投影与前缀缓存

OpenAI 的 [Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching) 复用的是模型渲染后足够长的相同输入前缀，而不是某种特定角色；合成调用和回执可属于该前缀，不需要额外的开头 `system` 或 `user`。

1. **同一轮内：固定工具列表，逐步追加消息。** `analyze → respond` 的两步发送同一份 `tools: [analyze, respond]`，定义和顺序不变，`tool_choice` 指向当前步骤。步骤也可分别设置模型、输出 token 上限和推理强度。第二步保留第一步的完整消息，再追加 `analyze` 的实际调用和回执（若返回的是纯文本，则原样追加文本），以及新步骤的提示和指令。固定列表不保证不同 `tool_choice` 在所有上游都沿用同一缓存前缀。
2. **跨用户轮：保留未变消息的表示，不改变注入位置。** 相同合成记录用稳定的来源标识，不因某条历史被摘要就按请求顺序重新编号。历史和本轮用户输入统一使用 `kind: "user"`，由末尾指令引用本轮输入的调用 ID。预设或世界书若在较前位置发生变化，仍会从该位置截断跨轮匹配；不会为缓存把它们移到不同的注入位置。

### 摘要更新如何影响前缀

现行[对话记忆](../.docs/db/features/chat-memory.md)不是每轮重写一份总摘要。默认保留最近 **5 个已闭合轮次**的原文；更旧的轮次才有资格在后台逐轮摘要，已有且仍有效的摘要不会重算。对话进入稳定滚动后，每完成一轮，通常会有一个较旧轮次移出原文窗口。普通生成仍把相邻摘要合并成一条消息；服务端管线也保留这份合并表示用于世界书扫描和深度计算，但不把合并内容作为单个调用发给模型。

**§8 按轮拆分请求中的摘要，不改变后台总结或持久化。** 每个已摘要轮次用独立的 `story_history` 调用和回执，沿用稳定 ID 和内容。新摘要就在被它替代的原文位置插入，不回写较早的摘要：

```text
上一轮：固定设定 → 摘要 1 → 摘要 2 → 原文 3 → 原文 4 → …
下一轮：固定设定 → 摘要 1 → 摘要 2 → 摘要 3 → 原文 4 → …
可复用：固定设定 → 摘要 1 → 摘要 2
```

拆分会增加调用和回执的开销，但不会因为摘要 3 加入就丢掉摘要 1、2 的前缀。如果原文替换仍过于频繁，可进一步只在原文缓冲达到一定大小或接近上下文预算时，**成批把已生成的摘要应用到上游请求**。这能让中间几轮继续追加，但要多发送一段原文，批次切换时仍会从首个替换点重新计算。旧剧情真的被编辑、重生成或裁掉时，应正常更新投影，而不是为了保缓存继续发送过期内容。
