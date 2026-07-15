# 第一方向量功能安全退役

## 意图与核心流程

一句话意图：从 EmberDesk 产品和运行时中删除第一方 vector 功能及其专属依赖，同时保留
旧派生数据和公共扩展兼容字段，使升级、回滚和非向量 Data Bank 工作流不受破坏。

主要参与者是普通 workspace 用户、仍持有旧设置或旧 vector index 的升级用户，以及可能
读取 SillyTavern 兼容字段的第三方扩展。

主路径：

1. 服务启动时不再导入 Vectra、vector provider adapters 或 embedding pipeline。
2. 扩展发现不再列出或加载内置 Vector Storage，workspace 和 World Info 不再显示可操作的
   vector 入口。
3. 旧客户端调用 `/api/vector/*` 时收到稳定的 `410 Gone` JSON，而不是触发 embedding、
   写索引或得到 HTML 404。
4. 旧 `vectors/` 目录、World Info `vectorized` 字段和兼容 prompt tags 保持原样，不在升级时
   自动删除或重写。
5. Data Bank 附件继续可打开、添加、更新、启停和删除，只失去原先由 Vector Storage 提供的
   语义检索、向量摄取和相关 slash commands。

## 范围 / 不做范围

本阶段包括：

- 删除 `src/endpoints/vectors.js` 和 `src/vectors/` 的第一方 query、insert、delete、purge、
  embedding provider 和本地 feature-extraction 实现。
- 删除 `public/scripts/extensions/vectors/`、`#vectors_container`、Vector Storage itemization
  展示，以及 World Info 编辑器中可选择的 `Vectorized` 状态。
- 删除 `vectra`、embedding-only 默认配置/配置迁移、Transformers `feature-extraction` task，
  以及仅供内置 Vector Storage 使用的 embedding 模型发现路由。
- 为旧 `/api/vector/*` 调用保留小型 `410 Gone` JSON tombstone。
- 更新 durable architecture、semantic docs、brief/spec 索引，取消 derived vector hardening
  后续工作。

本阶段不包括：

- 不自动删除、清空、迁移或压缩 `DATA_ROOT/<handle>/vectors/`。
- 不删除 `USER_DIRECTORY_TEMPLATE.vectors`、`req.user.directories.vectors` 或现有 legacy
  vector migration；这些兼容路径至少保留一个发布周期，便于代码回滚和数据导出。
- 不删除 World Info `vectorized` 持久化字段、角色卡转换字段或 Tavern Helper 已识别的
  `3_vectors` / `4_vectors_data_bank` prompt tags。
- 不删除 Data Bank 附件管理、普通文件读取、scraper、chat attachment 或 managed media。
- 不批量清理 locale 中已经不可达的 Vector Storage 翻译键；避免为无运行时影响的死键扩大
  本次 diff。
- 不缩减 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`、
  slash-command 公共导出或受保护 extension mount points。

## 边界规则 / 验收

R1: 扩展发现结果和 workspace 扩展面板不得再出现或加载内置 `vectors` / `Vector Storage`；
`public/scripts/extensions/vectors/` 运行时代码和 `#vectors_container` 必须删除。

R2: `/api/vector/query`、`query-multi`、`insert`、`list`、`delete`、`purge` 和 `purge-all`
不得执行向量计算或文件写入；所有旧 `/api/vector/*` 请求必须返回 HTTP `410` 和稳定 JSON
错误码 `vector_feature_removed`。

R3: `src/endpoints/vectors.js`、`src/vectors/`、`vectra` lockfile entry、Transformers
`feature-extraction` task、`extensions.models.embedding` 默认值/旧键迁移，以及只服务内置
Vector Storage 的 embedding 模型发现路由必须删除；Node 启动路径不得静态或动态导入这些实现。

R4: 升级和首次启动不得删除、移动或重写已有 `DATA_ROOT/<handle>/vectors/`；用户完整数据导出
仍须包含该目录，保证旧数据可由代码回滚版本恢复使用。

R5: World Info UI 不得再提供 `Vectorized` 选择或把旧 `vectorized: true` 显示成仍可用能力；
但 World Info JSON、角色卡 embedded lorebook 和 converter round-trip 必须原样保留
`extensions.vectorized` / `vectorized` 值，不能隐式归零或丢字段。

R6: `3_vectors` 和 `4_vectors_data_bank` 的兼容读取与 itemization 数据字段可以保持空值，
不得因为删除第一方扩展而改变第三方生成调用的对象结构；受保护扩展挂载点、事件和
slash-command 公共导出必须继续通过兼容测试。

R7: Data Bank 附件 UI 和 `/databank`、`/databank-list`、`/databank-get`、
`/databank-add`、`/databank-update`、`/databank-enable`、`/databank-disable`、
`/databank-delete` 工作流必须继续可用；仅 vector ingest、vector search 和 vector purge
命令消失。

R8: 在未安装 `vectra` 且不存在 `src/vectors/`、`public/scripts/extensions/vectors/` 的状态下，
服务启动、Express private route 注册、共享前端兼容测试和 World Info converter 测试必须通过。

R9: Durable docs 必须把 vector hardening 标记为被退役方向取代，并明确 vector indexes 是遗留
派生数据而非后续 canonical storage 工作项；语义文档必须说明扩展面板、World Info 和 Chat
Workspace 不再暴露第一方向量能力。

失败恢复规则：

- 如果浏览器仍持有旧扩展脚本或旧页面缓存，vector API 调用以 `410` 结束，不得创建或修改索引。
- 如果用户需要回滚到退役前版本，旧 `vectors/` 目录、配置中未知 embedding key 和 World Info
  字段仍在；代码回滚不得依赖本次实施生成的数据迁移。
- Data Bank 或 World Info 的非向量行为出现回归时，本次退役不算完成，不能以“功能已删除”
  为理由接受回归。

## 架构 / 约束

- `src/server-startup.js` 继续拥有 private route 注册顺序。`/api/vector` 的原位置可挂载一个
  无 provider import、无 filesystem mutation 的 tombstone router，避免改变相邻路由顺序。
- Tombstone 是兼容失败边界，不是 feature flag 或未来扩展点；不得保留 `vectra`、
  provider registry、source switch 或隐藏的重新启用路径。
- `sillytavern-transformers` 继续服务 classification、caption 和 speech，不得随 vector 删除。
  仅删除 `feature-extraction` task 和 embedding 配置引用。
- World Info 的字段 schema 属于文件/角色卡兼容边界。UI 将旧 `vectorized: true` 作为普通
  non-constant entry 显示，但保存无关字段时不得覆盖原值；只有用户明确改变 entry state 时，
  才按现有普通/constant 规则写入对应状态。
- Data Bank attachment extension 与 vectors extension 是两个独立 owner。删除 vectors extension
  时不得删除 `public/scripts/extensions/attachments/` 或 `#data_bank_wand_container`。
- `public/scripts/openai.js` 和 prompt itemization 若保留兼容 vector tag 字段，只能保留无计算、
  无 UI 承诺的结构兼容；不得继续显示 Vector Storage 已激活。
- 保持 `.docs/tech/third-party-extension-compatibility.md` 中的受保护表面，不以本次删除为由
  扩大 extension API retirement。

## 数据 / 集成

- 旧派生索引位置：`DATA_ROOT/<handle>/vectors/<source>/<collectionId>/<model>`。
- 本次没有 schema migration，没有数据 backfill，也没有启动时 cleanup。
- `USER_DIRECTORY_TEMPLATE.vectors` 和 legacy root `vectors/` migration 暂时保留，使旧安装、
  完整用户导出和代码回滚仍能找到原目录。
- World Info 的 `vectorized` / `extensions.vectorized` 继续作为兼容字段参与 import/export 和
  embedded character book round-trip，但不再驱动 EmberDesk 第一方行为。
- Data Bank attachment records、文件内容和 managed media references 不变。
- `/api/vector/*` tombstone 返回示例：

```json
{
  "error": "vector_feature_removed",
  "message": "Built-in vector functionality has been removed from EmberDesk."
}
```

- embedding provider 使用的 secret keys 若同时服务 chat completion 或其他 provider 能力，
  不在本次删除；只删除 vector-specific route 和 UI consumer。

## 验证

实施时至少执行：

```bash
bun install --frozen-lockfile
bun run --cwd tests test:unit -- vector-retirement.test.js world-info-converters.test.js express5-route-compatibility.test.js --runInBand
bun run test:compat
bun run --cwd tests test:e2e -- vector-retirement.e2e.js
bun run lint
bun run docs:check
```

自动化证据必须证明：

- `/api/vector/query` 和至少一个未知 `/api/vector/*` path 返回 `410` JSON，且测试夹具中的旧
  vector 文件未改变。
- extension discovery 不再返回 `vectors`，页面没有 Vector Storage mount/container。
- World Info 旧 `vectorized: true` 数据 round-trip 不丢失，但编辑器不再显示 Vectorized 选项。
- Data Bank 普通附件操作和入口仍存在，vector-only slash commands 不再注册。
- `package.json` 与 `bun.lock` 不含 `vectra`，运行时代码不引用 `src/vectors/` 或
  `extensions.models.embedding`。
- 服务能够在没有向量实现目录的 checkout 中注册全部 private endpoints。

人工 / 浏览器检查：

1. 打开 Extensions，确认没有 Vector Storage 设置块，其他内置和第三方扩展仍加载。
2. 打开 World Info，确认 entry state 只有普通/constant 可用；载入带
   `extensions.vectorized: true` 的 lorebook 后编辑其他字段并导出，原兼容字段仍存在。
3. 打开 Data Bank，完成附件添加、查看、禁用、启用和删除；界面不出现 vector ingest/search。
4. 使用旧客户端请求 `/api/vector/query`，确认收到可解析的 `410` JSON，而不是 500 或 HTML。

## Doc ID 契约

- `feature.extension_panel_open`
  - Owner：`.docs/db/features/extension-panel-open.md`
  - 绑定点：内置扩展 discovery 和 `public/index.html` extension settings mount lifecycle。
  - 预期：文档明确 Vector Storage 已退役，但受保护 mount points 和其他扩展保持可用。
- `feature.world_info_panel`
  - Owner：`.docs/db/features/world-info-panel.md`
  - 绑定点：World Info entry state selector 与 import/export converter。
  - 预期：文档明确 UI 不再提供 Vectorized 状态，兼容字段仍无损 round-trip。
- `page.chat_workspace`
  - Owner：`.docs/db/pages/chat-workspace.md`
  - 绑定点：workspace Extensions、World Info 和 Data Bank 可见流程。
  - 预期：文档明确第一方向量能力消失，但 Data Bank 附件和普通 workspace 流程继续可用。

验证要求：`bun run docs:check` 必须确认 ID 稳定、include 拓扑和代码到文档绑定无断链。

## 参考资料

- `src/server-startup.js`
- `src/endpoints/vectors.js`
- `src/vectors/`
- `src/transformers.js`
- `src/user-directories.js`
- `src/user-migrations.js`
- `src/users.js`
- `public/scripts/extensions/vectors/`
- `public/scripts/extensions/attachments/`
- `public/scripts/world-info.js`
- `public/scripts/world-info-converters.js`
- `public/scripts/openai.js`
- `public/scripts/extensions/third-party/JS-Slash-Runner/`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/briefs/260714-06-derived-vector-index-hardening.md`
- `.docs/tech/briefs/260715-01-built-in-vector-retirement.md`
- Inference：用 `410 Gone` tombstone 代替 HTML 404 是基于当前 API 为已登录私有 JSON endpoint、
  旧客户端可能继续调用，以及“删除功能但提供确定性失败”的最小兼容边界。
