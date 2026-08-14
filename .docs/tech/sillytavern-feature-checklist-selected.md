# SillyTavern 功能清单（精选）

> 范围：仅收录 Chat Completions / OpenAI(Custom)、连接管理、角色、聊天、世界书、Prompt 工程、Macros、用户设置与 UI、预设体系。
> 依据：SillyTavern 官方文档与常见 UI 行为；不包含群聊、扩展生态、多用户运维等未点名模块的完整说明。

## 1. Chat Completions · OpenAI (Custom)

### 协议本质

把「角色设定 + 历史 + 世界书 / 作者注等」组装成 **User / Assistant / System 消息序列** 发给模型，而不是整段纯文本续写。

### OpenAI / Custom 连接要点

| 项 | 说明 |
| --- | --- |
| API 类型 | Chat Completion |
| 目标 | 官方 OpenAI，或任意 **OpenAI 兼容** 端点 |
| Custom | 自填 **Base URL / Server URL** + **API Key** + **Model** |
| 连通性 | 可用 Test Message 探测 |
| 密钥 | 存 Secrets，界面默认不回显明文 |

### Prompt Post-Processing

用于兼容各类代理对消息格式的限制：

1. **None** — 不做额外整形（除非 API 硬性要求）
2. **Merge** — 合并连续同角色消息
3. **Semi-strict** — 合并角色，最多一条可选 system
4. **Strict** — 再要求第一条必须是 user；缺失时插入 `promptPlaceholder`（默认 `[Start a new chat]`）
5. **Single user message** — 全部压成一条 user

部分模式可带 / 不带 **tools**。选「no tools」时会剥掉 tool calls。Custom 端点对非法格式更敏感，可能直接报错。

### 与本模式强相关的选项

- Proxy preset（代理预设）
- 流式输出
- Tokenizer / 上下文与回复长度
- 采样参数（温度、Top-P 等，视后端是否透传）
- Reasoning 格式（若模型 / 代理支持）
- Start Reply With / Custom Stopping Strings（可与连接配置档一起保存）

## 2. 连接管理（Connection Profiles）

### 作用

在多 API / 多模型 / 多模板之间 **一键切换**，避免每次手改菜单。

### 入口

API Connections 面板。也可在扩展管理中关闭 Connection Manager。

### 配置档保存内容

**通用**

- API 类型、模型、Server URL
- Secret Key
- Settings preset（采样 / 通用设置预设）
- Start Reply With（可显式为空）
- Custom Stopping Strings（可显式为空）
- Reasoning Formatting

**Text Completion 另存**

- System Prompt 及开关
- Instruct Mode 及模板
- Context Template
- Tokenizer

**Chat Completion 另存**

- Prompt Post-Processing
- Proxy preset

### 管理操作

- Create / Update / Reload / Delete / Information
- 切换配置档只恢复「下拉选择」；**未点 Update 的临时改动会丢**
- 相关预设 / 模板若本身未保存，切换后也会丢失 ephemeral 修改

### 斜杠命令

| 命令 | 作用 |
| --- | --- |
| `/profile [name]` | 切换配置档；无参数时返回当前名 |
| `/profile-create [name]` | 以当前设置新建配置档 |
| `/profile-list` | 列出全部配置档名（JSON） |
| `/profile-get [name]` | 获取指定配置档详情（JSON） |
| `/profile-update` | 用当前设置更新已选配置档 |

## 3. 角色（Characters）

### 管理面板

- 列表：搜索、排序、按类型 / 标签过滤
- 创建 / 编辑 / 收藏
- 导入角色卡（可带标签导入策略）
- 导出
- 批量编辑
- **Tags / Tags as Folders**
- 头像、缩略图

### 卡面字段

| 字段 | 作用 |
| --- | --- |
| Description | 主设定（永久进上下文的核心） |
| First Message | 开场白 |
| Alternate Greetings | 多开场 |
| Personality | 性格摘要 |
| Scenario | 场景 |
| Examples of dialogue | 对话范例 |
| Character's Note | 角色注 |
| Talkativeness | 话痨程度（群聊权重相关） |
| Creator metadata | 作者元数据 |
| Prompt Overrides | 覆盖 Chat Completion / Instruct 下的提示块 |

### Token 与上下文

- 角色 token 计数与超限提示
- 「永久 token」vs 非永久部分（历史、一次性注入等）
- 超长卡会挤占聊天历史与世界书预算

### 与角色相关的其它内容

- Character Lore（角色世界书）
- Author's Note 默认值（也可按聊天覆盖）
- 欢迎页无选卡开聊 → 生成临时 Assistant 再补全

### 聊天文件管理（角色维度）

- 单聊 / 群聊分离
- 导入聊天
- 导出 `.jsonl` / `.txt`
- Checkpoint、重命名

## 4. 聊天（Chatting）

### 消息操作

- 编辑 / 删除 / 隐藏 / 可见性
- 位置调整、复制等
- **Swipe**（同轮多候选）
- 重新生成 / Continue
- Checkpoint / 分支（Branches）
- Bookmark
- Token probabilities / logprobs（后端支持时）
- Markdown 输入与热键

### 聊天选项

- 显示控制
- 生成相关开关
- 导航（历史聊天切换）
- 聊天管理（新建、备份相关入口）
- Auto-swipe / Auto-continue

### 会话数据

- 按角色保存聊天目录
- 导入 / 导出、重命名
- 聊天备份
- 欢迎页快速开聊

### 与生成链路的关系

```text
角色卡 +（可选）Persona + 历史消息
+ World Info 命中项 + Author's Note
+ Prompt Manager / Instruct / Context 模板
+ Macros 展开后的动态内容
→ Chat Completions 消息数组 → 模型
```

## 5. World Info / Lorebook（世界书）

### 作用

按关键词 / 条件 **动态注入** 设定，节省角色卡永久 token，适合世界设定、专有名词、场景规则等。

### 来源层级

- 全局 World Info
- Character Lore
- Persona Lorebook
- Chat Lorebook

**插入策略**

- Sorted Evenly（默认）
- Character Lore First
- Global Lore First

### 条目（Entry）

| 能力 | 说明 |
| --- | --- |
| Key | 触发词；支持 **Regex** / 高级按消息匹配 |
| Optional Filter | 附加过滤 |
| Content | 注入正文 |
| Order / Position | 顺序与插入位置 |
| Outlet Name | 出口名（有限制） |
| Title / Memo | 备注 |
| Strategy | 匹配策略 |
| Probability | 触发概率 |
| Inclusion Group | 互斥 / 分组；可 prioritize、group scoring |
| Automation ID | 自动化标识 |
| Character Filter | 限定角色 |
| Triggers | 触发条件 |
| 额外匹配源 | 不止扫描最近消息 |
| Vector Matching | 向量相似度匹配 |
| Timed Effects | 时效效果 |

### 激活预算与扫描

- Scan Depth
- Include Names
- Context % / Budget
- Min Activations / Max Depth
- Recursive scanning / Max Recursion Steps
- Case-sensitive / Match whole words
- Overflow alert

## 6. Prompt 工程与格式化

### Instruct Mode

用 Instruct 模板把对话格式化成模型习惯的指令形态。常与 Text Completion 强绑定；Chat Completion 侧更多靠消息角色 + Prompt Manager。

### Context Template

定义「上下文如何拼进 prompt」：历史、角色字段、分隔方式等。

### Prompt Manager

提示词块列表：启用 / 禁用、排序、来源。对 Chat Completion 尤其重要，用于 system / 示例 / 作者注等块的可控编排。

### Advanced Formatting

- System Prompt
- Start Reply With
- Custom Stopping Strings
- Tokenizer 选择
- 社区 / 自建格式预设
- 与连接配置档联动保存

### Author's Note

- 默认 Author's Note / 本聊天覆盖
- 位置：After Scenario / In-chat
- 插入频率
- 用途：格式提醒、临时规则、短时设定

### Reasoning

- 推理内容的识别、显示、是否送回上下文
- 格式配置可写入 Connection Profile

### Tokenizer

- 选择 tokenizer 以贴近后端真实计费 / 截断
- 角色卡与上下文 token 预警

### 常用采样 / 长度

常与预设一起管理：

- Context tokens / Response tokens
- Temperature、Repetition Penalty、Top-K / Top-P、Min-P、DRY、Mirostat 等（视 API 是否支持）

## 7. Macros（宏系统）

### 作用

在角色卡、世界书、作者注、快捷回复、部分模板中写 **动态占位符**，发送前展开。

### 语法能力

- 基础 `{{macro}}`
- 参数（空格 / `::` / 旧式 `:`）
- 嵌套宏
- Scoped macros
- 条件宏（if / 反条件 / if-else）
- Flags、注释、转义
- **变量速记**：get / set / inc / dec / 加减、比较、`||` / `??` 及赋值变体

### 常用宏类别

| 类 | 例子方向 |
| --- | --- |
| 名字与参与者 | 用户名、角色名、群成员 |
| 卡与 Persona 字段 | description、personality、scenario 等 |
| 聊天历史 | 最近消息、条数相关 |
| 时间日期 | 当前时间等 |
| 变量 | 会话 / 全局变量 |
| 随机 | 随机选文 |
| 运行时状态 | 当前 API / 模式相关 |
| Prompt 模板 | 模板片段 |
| 工具类 | 转义、裁剪等 |

### 使用体验

- 宏自动补全
- 可与斜杠命令 / Quick Reply / 脚本流程组合做自动化

## 8. 用户设置与 UI

### 账户与系统入口

- 软件版本
- Account / Admin（多用户开启时）
- Logout
- **Settings Search**

### UI Theme 与外观

- 主题管理（切换 / 保存）
- Avatar style / Chat style
- 通知
- 媒体样式
- 主题色
- 布局与视觉开关
- **Custom CSS**
- 消息音效
- 公式渲染

### 角色与杂项行为

- Character handling 相关开关
- Miscellaneous 杂项

### 聊天 / 消息显示与输入

- 消息显示（时间、头像、气泡等，视主题）
- 输入与响应控制
- Auto-swipe / Auto-continue
- 消息格式化与显示
- Prompt 检查 / 调试入口
- AutoComplete

### STscript 相关设置

- `STRICT_ESCAPING`
- `REPLACE_GETVAR`

### Clean-Up

清理类别：

- Files
- Images
- Chats
- Group Chats
- 头像 / 背景缩略图
- Chat backups
- Settings backups

### Debug

- 翻译 / 语言
- 缓存与存储
- 数据与统计
- API / 扩展测试
- 系统调试工具

### Visual Novel（若启用）

VN 风格布局 / 演出相关用户设置（独立文档页）。

## 9. 预设体系（Presets）

### 核心概念

预设 = **某一类设置的命名快照**，可切换、导入导出。Connection Profile 往往只记住「选了哪个预设名」，不内嵌全部数值。

### 常见预设类型

| 类型 | 管什么 |
| --- | --- |
| Settings / Sampler 预设 | 温度、Top-P、上下文长度等通用采样 |
| Instruct 模板预设 | Instruct Mode 格式 |
| Context 模板预设 | Context Template |
| System Prompt 预设 | 系统提示 |
| OpenAI / Chat Completion 相关预设 | 代理、post-processing、厂商面板项 |
| Theme 预设 | UI 主题 |
| 后端专用预设 | 如 TextGen、NovelAI、Kobold 等面板 |

### 管理要点

- Preset Manager：新建、更新、删除、导入
- **先保存预设，再 Update Connection Profile**，避免丢改动
- 社区预设可批量导入
- 与 Advanced Formatting、Common Settings、API 面板交叉引用

## 能力关系（仅含上述模块）

```text
Connection Profile
  ├─ OpenAI Custom (URL / Key / Model / Post-Processing)
  ├─ Settings / Instruct / Context / Theme 等预设名
  └─ Reasoning / Start Reply With / Stop Strings

角色卡 +（可选）Persona
  └─ Character Lore

聊天消息流
  ├─ World Info 动态注入
  ├─ Author's Note
  ├─ Prompt Manager + Instruct / Context 模板
  └─ Macros 展开

→ Chat Completions 请求
← 流式回复 → Swipe / 编辑 / 分支

用户设置 & UI 主题影响展示与操作习惯
```

## 参考

- 文档站：<https://docs.sillytavern.app/>
- 仓库：<https://github.com/SillyTavern/SillyTavern>
- 相关文档路径示例：
  - `Usage/API_Connections/`
  - `Usage/Characters/`
  - `Usage/Chatting/`
  - `Usage/worldinfo.md`
  - `Usage/Prompts/`
  - `Usage/macros.md`
  - `Usage/User_Settings/`
