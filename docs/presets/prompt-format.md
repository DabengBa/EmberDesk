# EmberDesk 预设(Preset)JSON 格式说明

> 适用对象:`data/<user>/OpenAI Settings/*.json` 的 chat-completion 预设文件。
> 同目录示例:`Latest-1st.json`(已从上游 SillyTavern 格式转换)。
> 权威代码:`public/scripts/openai.js`(`default_settings`、`migrateChatCompletionSettings`、`loadOpenAISettings`),`src/endpoints/presets.js`。

## 顶层结构

预设文件是一个扁平 JSON 对象,分四组:

```json
{
  "chat_completion_source": "openai",
  "openai_model": "rpg",
  "custom_url": "https://…/v1",
  "fallback_provider_model": "",
  "temperature": 1,
  "openai_max_tokens": 12000,
  "prompts": [ ... ],
  "prompt_order": [ ... ],
  "extensions": { "regex_scripts": [] }
}
```

| 组 | 键 | 说明 |
|---|---|---|
| 连接契约 | `chat_completion_source` | 恒为 `"openai"`(单 provider;上游的 `custom`/`vertexai`/`makersuite`/`claude` 载入时归一) |
| | `openai_model` | 主模型;上游 `custom_model` 在其为空时折叠进来 |
| | `custom_url` | OpenAI-compatible endpoint;空 = 官方 api.openai.com |
| | `fallback_provider_model` | fallback 模型,与主连接共用 URL/key;空 = 关闭 |
| 采样/生成 | `temperature` `top_p` `top_k` `min_p` `top_a` `frequency_penalty` `presence_penalty` `repetition_penalty` `n` `seed` `openai_max_context` `openai_max_tokens` `stream_openai` | 常规采样参数 |
| 行为 | `reasoning_effort`(`auto/low/medium/high`)`verbosity`(`auto`)`tool_reasoning_mode` `names_behavior` `media_inlining` `inline_image_quality` `continue_prefill` `continue_postfix` `continue_nudge_prompt` `squash_system_messages` `show_thoughts` `send_if_empty` `impersonation_prompt` `new_chat_prompt` `new_example_chat_prompt` `wi_format` `description_format` | 生成期行为开关与模板 |
| prompt 集 | `prompts` `prompt_order` `extensions` | 见下节 |

载入时 `migrateChatCompletionSettings` 只应用 `default_settings` 表内已知键;未知键(上游专属,如 `claude_model`、`vertexai_*`、`openrouter_*`)惰性忽略、下次保存时剥离。

## 退役键(写入无效,载入即删)

`max_context_unlocked`、`reverse_proxy`、`proxy_password`、`custom_include_body`、`custom_exclude_body`、`custom_include_headers`、`fallback_provider_enabled`、`fallback_provider_base_url`、`bind_preset_to_connection`、`main_prompt`、`nsfw_prompt`、`jailbreak_prompt`、`personality_format`、`scenario_format`、`custom_prompt_post_processing`、`function_calling`、`tool_call_recurse_limit`。

注:prompt post-processing 已固定为 strict 语义(合并连续同角色、中间 system 降级为 user、必要时补首条 user 占位),不再是预设字段;请求发出前由服务端统一应用。function calling 随之退役——strict 会剥离 tool 字段。

退役 prompt 标识符在载入时由 `PromptManager` 归一:`worldInfoBefore`/`worldInfoAfter` 折叠为 `worldInfo`;`main`、`nsfw`、`jailbreak`、`enhanceDefinitions`、`summary`、`authorsNote`、`vectorsMemory`、`vectorsDataBank`、`smartContext`、`scenario`、`personaDescription`、`charPersonality` 从 `prompt_order` 与 `prompts[]` 中剔除。

注:`reverse_proxy` 有半迁移语义——仅当 `custom_url` 为空时折叠为 `custom_url`,随后仍被删除。`fallback_provider_enabled: false` 会连带删除 `fallback_provider_model`(显式关闭不复活)。

## `prompts[]` —— 条目库

每个元素:

```json
{
  "identifier": "bf702646-0a54-495b-a6ae-d339dd678d11",
  "name": "## 角色",
  "enabled": true,
  "role": "system",
  "content": "[Core Role]\n- 身份:…",
  "system_prompt": false,
  "marker": false,
  "forbid_overrides": false,
  "injection_position": 0,
  "injection_depth": 4,
  "injection_order": 100,
  "injection_trigger": []
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `identifier` | string | 稳定 ID。自定义条目用 UUID;内置占位符是固定名(`chatHistory`、`charDescription`、`worldInfo`、`dialogueExamples`) |
| `name` | string | Prompt Manager 显示名 |
| `enabled` | bool | 条目级开关;`prompt_order` 中的 enabled 优先 |
| `role` | `system`/`user`/`assistant` | 组装时的消息角色 |
| `content` | string | 正文;支持 `{{macro}}`(见下) |
| `system_prompt` | bool | `true` = 内置占位符,`content` 为空,运行时注入真实数据(世界书、角色描述、聊天记录等) |
| `marker` | bool | 标记占位符而非静态文本 |
| `forbid_overrides` | bool | 禁止角色卡/其他来源覆盖该条目 |
| `injection_position` | 0/1 | `0` = 按 prompt_order 排在主 prompt 流;`1` = 绝对深度注入(插在距聊天底部 `injection_depth` 条处) |
| `injection_depth` | int | 仅 `position=1` 生效 |
| `injection_order` | int | 同深度/同位置的排序键(小→先) |
| `injection_trigger` | array | 触发条件;空 = 恒启用 |

## `prompt_order[]` —— 排序与启用快照

```json
[
  {
    "character_id": 100001,
    "order": [
      { "identifier": "…", "enabled": true },
      { "identifier": "chatHistory", "enabled": true }
    ]
  }
]
```

- **按 `character_id` 分桶**:不同角色可存不同排序方案;`100001` 是默认兜底桶。
- `order` 数组的顺序即主 prompt 组装顺序;`Chat History` 占位符在哪,它之前的内容就在聊天记录之前注入,之后的在其后。
- 每项 `{identifier, enabled}` 覆盖 `prompts[]` 对应条目的 `enabled`——Prompt Manager 的拖动排序与勾选框实际写到这里。
- `prompts[]` 里有但 `order` 里没有的条目不参与组装(等价于未启用);`order` 里有但 `prompts[]` 没有的 identifier 被忽略。

## `extensions`

```json
{ "regex_scripts": [] }
```

预设级 regex 脚本绑定列表,示例文件为空。

## 正文中可用的宏(content / 各模板字段)

宏在每次生成时解析(除注明外):

| 宏 | 语义 |
|---|---|
| `{{user}}` `{{char}}` `{{charPrompt}}` 等 env 宏 | 用户名/角色名等环境值 |
| `{{random::A::B::C}}` | 随机选**一个**,每次解析重掷 |
| `{{sample:N::A::B::C::D}}` | 随机选 **N 个不重复项**,乱序,逗号连接,每次解析重掷。例:`输出{{sample:3::A::B::C::D::E::F}}` → `输出E,B,C` |
| `{{pick::A::B}}` | 随机选一个,但按 `chat_id + 宏位置 + reroll 种子` 固定——同对话内结果稳定;`/reroll-pick` 换一批 |
| `{{roll:2d6}}` | 骰子表达式 |
| `{{if a::b}}` `{{else}}` `{{/if}}` | 条件块 |
| `{{getvar::name}}` `{{setvar::name::v}}` 等 | 变量读写(见 variable-macros) |
| 空格/转义:`{{space}}` `{{newline}}` 等 | 字面控制 |

### `sample` 语法兼容

以下写法等价,均解析为 `['3','A','B','C','D','E','F']` 列表:

- `{{sample:3::A::B::C::D::E::F}}`(推荐)
- `{{sample::3::A::B::C::D::E::F}}`
- `{{sample:3,A,B,C,D,E,F}}`(legacy 单参逗号分隔)

N 大于列表长度 → 返回整个列表的乱序;N≤0 或 N 非整数 → 空串。
