---
created: 2026-07-15
source: user
confirmed: true
last_updated: 2026-07-15
feature_slug: built-in-vector-retirement
status: delivered
---

# Built-in Vector Retirement Intent

## 原始请求

用户明确表示不需要向量功能，并要求评估如何从 EmberDesk 中安全剔除。

## 目标结果

EmberDesk 不再提供或加载第一方 vector runtime、内置 Vector Storage 扩展、embedding
provider adapters 和相关模型发现接口，同时升级过程不自动删除现有派生索引，不破坏
Data Bank 附件，也不损坏 World Info 或第三方扩展仍可能读取的兼容字段。

## Checkpoint A

- **目标结果**：删除第一方向量能力及其专属依赖和入口，而不是仅增加一个长期保留的默认关闭开关。
- **当前状态**：`src/server-startup.js` 无条件加载 `/api/vector`；`src/endpoints/vectors.js`
  依赖 `vectra` 和 `src/vectors/`；`public/scripts/extensions/vectors/` 提供第一方 UI、
  prompt injection、Data Bank 语义检索和 slash commands。
- **假设**：用户所说“不需要向量功能”指 EmberDesk 第一方产品能力；兼容数据字段和
  第三方公共扩展表面不应作为顺手清理项删除。
- **硬约束**：Data Bank 附件 CRUD 独立保留；现有 `vectors/` 目录不自动 purge；
  World Info `vectorized` 字段继续无损导入、导出和保存；受保护扩展挂载点、
  `eventSource`、`event_types`、`@sillytavern/*` 和 slash-command 公共导出不变。
- **风险边界**：直接删除路由会让旧客户端收到 HTML 404；直接删除 World Info 字段会
  改写角色卡和 lorebook；删除 `sillytavern-transformers` 会误伤分类、图片描述和语音能力；
  删除 Data Bank 会扩大到不相关的附件功能。
- **未决问题**：无。用户已经用当前请求取代 2026-07-14 的 derived vector hardening 方向。
- **推荐默认**：一次性删除第一方 vector 实现和 `vectra`，但保留一个轻量
  `/api/vector/*` `410 Gone` JSON tombstone；保留旧派生目录和兼容字段，不增加新的长期功能门。

## 范围边界

- 删除内置 Vector Storage 扩展、服务端 vector API 实现、provider adapters、
  embedding-only 模型发现接口、专属配置和 `vectra`。
- 删除第一方 UI 中会承诺向量能力的入口、World Info 的可选“Vectorized”状态和
  prompt itemization 中的 Vector Storage 行。
- 保留旧 `vectorized` 数据字段和 `3_vectors` / `4_vectors_data_bank` prompt tag
  兼容读取，避免角色卡、lorebook 和 Tavern Helper 出现结构性损坏。
- 保留 `vectors` 目录路径约定和旧数据迁移一个兼容周期；不自动删除、移动或重写现有索引。
- 保留 Data Bank 附件管理、上传、启停、删除和普通文件读取。

## 变更历史

- 2026-07-14：原方向是强化 derived vector generations，并保持 `/api/vector` 与内置 UI。
- 2026-07-15：用户确认 EmberDesk 不再需要向量功能；当前方向取代 hardening，改为删除
  第一方运行时并保留数据与公共扩展兼容壳。

## 参考资料

- `src/server-startup.js`
- `src/endpoints/vector-retirement.js`
- `src/server-startup.js`
- `public/scripts/world-info.js`
- `public/scripts/world-info-converters.js`
- `public/scripts/extensions/attachments/`
- `public/scripts/extensions/third-party/JS-Slash-Runner/`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/briefs/260714-06-derived-vector-index-hardening.md`
