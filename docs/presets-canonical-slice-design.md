# OpenAI presets 纳入 canonical SQLite（设计稿）

> 状态：**已实施**。P0–P4 全量落地：migration v13（`preset_documents` +
> `preset_migration_markers`）、`presets-store.js`、`canonical-presets-shadow-import.js`
> （一次性 marker 导入）、slice 注册、`/api/presets/*` 与 `/get` 走 canonical、
> `content-manager` 播种改 `ensureCanonicalPreset`（content.log 防复活语义保留）、
> `export-all` 物化 `OpenAI Settings/<name>.json`、`readPresetsFromDirectoryAsync`
> 死代码删除。承接 `docs/settings-json-removal-design.md` 的收尾范式——
> presets 一步到位进入"settings 终态"，未经历 sync-projection 中间时代。

## 目标

`OpenAI Settings/*.json` 预设文件退出运行时权威：canonical `storage/emberdesk.sqlite`
新增 `preset_documents` 表，预设的读/写/删/恢复默认全部走 canonical。
文件只保留两个合法角色：**一次性迁移输入**（init import，marker 记讫）与
**用户主动导出产物**。

**非目标**：

- 不改客户端契约：`/api/presets/save|delete|restore` REST 与
  `/api/settings/get` 的 `openai_settings`/`openai_setting_names` 数组形状全部原样保留。
- 不做预设快照/版本历史（settings 的快照机制不照搬——预设是独立命名文档，
  文件时代就没有历史语义）。
- 不动 `apiId` 多提供方扩展面（schema 预留 `api_id` 列即可，不提供方实现）。
- 不删除用户目录里已存在的预设文件（迁移后惰性化）。

## 现状盘点（已按代码核实）

### 文件的全部现存角色

| 角色 | 位置 | 说明 |
|---|---|---|
| 读 | `src/endpoints/settings.js:413` `readPresetsFromDirectoryAsync(dirs.openAI_Settings)` | `/api/settings/get` 内嵌目录扫描，经 `settings-cache.js` 5s TTL 目录缓存 |
| 写 | `src/endpoints/presets.js:42` `/save` → `writeFileAtomicSync` | 直写 `OpenAI Settings/<name>.json`；`invalidateDirectory` 刷缓存 |
| 删 | `presets.js:60-68` `/delete` → `fs.unlinkSync` | |
| 恢复默认 | `presets.js:71-91` `/restore` → `getDefaultPresetFile` | 读 bundled `default/presets/openai/*.json`，不写用户文件（已天然 file-free） |
| 播种 | `default/content/index.json` `presets/openai/Default.json` → `content-manager.js` `OPENAI_PRESET` → `directories.openAI_Settings`；`checkForNewContent` 在 `server-main.js:318` 每启动跑 + `users-private.js:268` reset-step2 | "目标不存在才拷"语义 |
| 旧版迁移 | `user-migrations.js:63-64` `public/OpenAI Settings` → 目录拷贝 | 拷贝后即成普通预设文件 |
| 客户端 | `public/scripts/preset-manager.js`（save/delete/rename=save+delete/restore）+ `openai.js`（PRESET_CHANGED/DELETED 事件） | 全部经上述三个端点 + `/get` 数组，无文件路径概念 |

### 与 settings 的结构差异（决定设计选型）

| 维度 | settings | presets |
|---|---|---|
| 基数 | 单例文档 | 命名文档集合（N 行） |
| 历史 | 有 revision+snapshots | 无（LWW） |
| 文件布局 | 用户根单文件 | 子目录多文件 |
| 播种语义 | 无文档→建 | 名字缺席→插入 |
| 参照 slice | `settings_documents` | `world_books`（命名文档集合） |

**结论**：数据模型照 `world_books`/命名文档范式，迁移策略照 `secret_migration_markers`
的一次性 marker 范式——两者在仓库里都有现成前身。

## 核心决策

### D1：文件迁移 = 一次性 init import + marker，不做持久候选

settings 的教训：持久 contract 候选会在 audit-stale 时变成覆盖式 upsert 通道
（已记录在案的 D2=B 风险）。presets 从第一天就避开这个机制：

- slice init 时扫描 `directories.openAI_Settings`，逐文件解析 + upsert；
- 每文件一条 `preset_migration_markers`（照 `secret_migration_markers`：v5 先例，
  `marker_key`/`source_hash`/`imported_at_ms`）；
- **marker 存在 → 永不重扫**——audit-stale、重启、升级都不再碰文件。
  文件自此零语义，无"残留文件覆盖 DB"风险敞口；
- 坏文件（invalid JSON）：记 `marker_key` 为失败态？——不，marker 只记成功；
  坏文件每次 init 会重试一次并 warn，代价可接受（目录通常 <50 文件），
  且符合"失败保留现场"惯例；
- `user-migrations.js` 的 `public/OpenAI Settings` 拷贝**保留不动**——
  旧版文件拷进目录后由同一条 init import 拾取，单一路径不重复实现。

### D2：无 projection 时代，`getProjectionMode` 恒 `'off'` + warn-once

presets 从未有 `sync` 投影，注册时 `defaultProjection: 'off'`，并照 settings 终态
把 `slices.presets.projection` 读为弃用键（配置非 off 时一次性 warn 并忽略）。
**不实现任何 `writePresetProjection`/文件回写函数**——不像其它 slice 经历过
"先 sync 后 off"，本 slice 一步到位。

### D3：`/api/settings/get` 内嵌读改 canonical，契约不变

`openai_settings`/`openai_setting_names` 从 `preset_documents` 读
（`api_id='openai'`，按 name `localeCompare` 排序——与目录读完全同序，
客户端数组索引语义不变）。canonical 不可用 → 与 `/get` 其余部分一致的
503 `canonical_storage_unavailable`，无文件兜底分支。

### D4：schema（migration v13）

```sql
CREATE TABLE IF NOT EXISTS preset_documents (
    api_id TEXT NOT NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    source TEXT NOT NULL,          -- 'seed' | 'user' | 'import'
    created_ms INTEGER NOT NULL,
    updated_ms INTEGER NOT NULL,
    PRIMARY KEY (api_id, name)
);
CREATE TABLE IF NOT EXISTS preset_migration_markers (
    marker_key TEXT PRIMARY KEY,   -- 文件相对路径
    source_hash TEXT NOT NULL,
    imported_at_ms INTEGER NOT NULL
);
```

- `revision` 单调（照 `settings_documents` 先例），`/save` 做 LWW upsert 即 rev+1——
  列保留以便未来要并发控制，本期 API 不暴露 expectedRevision；
- `content_hash` 用 settings 同一稳定序列化路径；
- `source` 区分播种/用户/导入，供审计与导出溯源；
- 不做 `preset_projection_repairs` 表——本 slice 无投影史，无 repair 语义；
  `listOpenRepairs: () => []`（stub 满足 slice 契约，见 D6）。

### D5：播种改 canonical upsert-if-absent

- `content-manager.js` `OPENAI_PRESET` 的 `getUserTargetByType` 分支删除；
  `checkForNewContent` 遇到 `openai_preset` 类型改调
  `ensureCanonicalPreset(apiId='openai', name, payload, source='seed')`——
  语义保持"名字缺席才插"（用户删过的预设不会被升级悄悄塞回，与文件语义一致）；
- canonical 暂不可用时 checkForNewContent 对 presets 跳过并 warn（不阻塞启动）；
- `default/content/presets/openai/Default.json` 文件本身保留——bundled 模板不动，
  `getDefaultPresetFile`/`/restore` 继续用它。

### D6：slice 注册（registry 第 7 个）

`key: 'presets'`、`flagKey: 'presets'`、`auditScope: 'presets'`，
`getMigrationReadiness` 复用 `createSharedMigrationReadiness`，
`getRollbackBlockers` 复用 `buildCanonicalSliceRollbackBlockers`
（`openRepairCode` 传占位串 + `listOpenRepairs` stub 恒 `[]`），
`getBackupManagedPaths: () => []`（照 settings：备份走 canonical，无受管文件路径）。

审计收敛为：schema 就绪校验 + 持久化干净判定。**不探测文件侧 drift**
（无 `missing_*`/`payload_mismatch` 条目）——同 settings 终态。

### D7：导出物化保留文件名

`export-all` 把 `preset_documents` 物化为 `OpenAI Settings/<name>.json`——
与历史文件布局一致（产物可回灌旧版/人读），与 `settings.export.json` 的
`.export` 改名不同，因为预设目录名本身已不与"运行时权威"混淆
（运行时已无任何代码读该目录）。

### D8：`OpenAI Settings` 目录模板保留

`USER_DIRECTORY_TEMPLATE.openAI_Settings` 本期保留（mkdir 成本为零；
`presets.js`/content-manager 的引用点清理后它只是空目录）。
是否随 retired-dirs 一并退役留给独立清理，不在本设计内。

## 分阶段方案

### P0：schema + store + slice 注册

- migration **v13**：`preset_documents` + `preset_migration_markers`；
- 新增 `src/endpoints/presets-store.js`（照 `settings-store.js`/`world-info-store.js`
  命名与风格）：`listCanonicalPresets`、`getCanonicalPreset`、
  `upsertCanonicalPreset`（rev 单调 + content_hash + source）、
  `deleteCanonicalPreset`、`ensureCanonicalPreset`（INSERT OR IGNORE 语义）、
  `importPresetFile`（marker 检查 + upsert `source:'import'` + 记 marker）；
- registry 注册 `presets` slice（D6）；`canonical-backend.js` init 链接入
  import 步骤——但**绕开 audit 状态机驱动**（D1：无文件侧 audit，import 由
  "marker 未记讫"驱动而非 audit-stale 驱动）；
- 测试：`preset-store` CRUD/rev/upsert-if-absent、registry 注册、
  migration v13 幂等。

### P1：端点迁移（行为零变化）

- `presets.js`：`/save` → `upsertCanonicalPreset(source:'user')`；
  `/delete` → `deleteCanonicalPreset`（不存在仍 404）；
  `/restore` 保持读 bundled 模板（已 file-free）；
- `settings.js` `/get`：`openai_settings`/`openai_setting_names` 改读
  `listCanonicalPresets`（Promise.all 内替换目录读，移除
  `readPresetsFromDirectoryAsync`/`invalidateDirectory` 对 presets 的引用）；
- 三者统一 `ensureCanonicalSliceBackend('presets')` 前置 + 503 语义；
- 测试：route 级——save 落库/列表序/delete 404/canonical-unavailable 503；
  客户端无感断言（`/get` 响应形状 diff）。

### P2：迁移 + 播种（D1/D5）

- init import 实现 + marker；`user-migrations` 路径回归（`public/OpenAI Settings`
  拷入 → init import 拾取 → marker → 文件惰性）；
- `content-manager` `openai_preset` 播种分支改 `ensureCanonicalPreset`；
- 测试：存量文件导入幂等（二启不重导）、坏文件 warn+重试、
  `checkForNewContent` 名字冲突不覆盖、reset-step2 兼容。

### P3：导出 + 清理

- `canonical-sqlite-export.js` presets slice 物化（D7）；
- 常量/注释术语清理（`openAI_Settings` 引用收敛）；
- 测试：export-all 产物布局、`settings-get-route`/`presets` 路由回归。

### P4：文档

- roadmap P2 行补 presets（第 7 个 default-off slice）、新里程碑行；
- `.docs/db` 语义文档（settings 页预设段 + 视需要新 feature 页）；
- 本设计文档状态头更新。

## 风险表

| 风险 | 缓解 |
|---|---|
| 用户在 init import 后手改目录文件期待生效 | D1 marker 语义 = 文件彻底惰性；文档写明"改文件唯一生效途径是删 marker 或 export-all 回灌"——与 settings 惰性文件完全同规则 |
| `/get` 是热路径，presets 查询增加延迟 | 单用户 sqlite 本地查询 <1ms；`settings-cache` 目录缓存可同步退役 presets 目录键 |
| `checkForNewContent` 启动时 canonical 未就绪 | P2 对 presets 分支 try/catch 跳过（预设播种非启动阻塞项） |
| marker 表丢失（DB 重建）→ 旧文件重新导入覆盖新数据 | import upsert 对同名行用 `source='import'` 且**只在目标不存在或 hash 相同时写**；hash 不同的既有用户行不覆盖（保守策略，文件永不赢） |
| apiId 未来扩展 | schema 已复合主键；`getPresetSettingsByAPI` 扩展时无需迁移 |

## 与 settings 收官的对照备忘

直接复用：稳定序列化/content_hash、`expectedRevision`-风格 upsert、
`ensureCanonicalSliceBackend` 503 模式、marker 防重导、export-all 物化、
warn-once 弃用键。**刻意不沿用**：文件持久 import 候选（settings 的 D2=B
风险在本 slice 不存在）、投影修复表、文件侧 audit 探测。
