# settings.json 彻底移除方案（设计 v2）

> v2 修订：按代码核对修正盘点与决策点。核心事实变化：① `canonical_flags_unavailable` 在生产不可达（`server.js` 无条件设置 `COMMAND_LINE_ARGS`），兜底分支仅单测可达；② "文件存在→导入"不是通道——导入与否完全由 audit 状态机决定，现状是"无隐式通道 + audit-stale 时有覆盖式 upsert 风险"；③ 兜底写是"静默丢写"（audit 永不置 stale），不是"读到陈旧值"。

## 实施状态（最终）

全部里程碑已落地，验证 72/72 聚焦单测绿 + lint/tsc 干净：

- **M0 ✅** `/reset-settings` → `resetCanonicalSettings()`（`settings.js`），重置 canonical 文档（缺失时建 rev=1），快照保留；`users-private.js` force-seed 已删；重置时顺带删除残存文件。
- **M1a ✅** `ensureCanonicalSettingsDocument()`（`settings-store.js` + `ensureCanonicalSettingsForUser` 在 `settings.js`）挂在 `/get`、`/save`、`/make-snapshot`、`/restore-snapshot` 的 canonical state 之后，并在 `users-public`、`users-admin` 建用户入口显式调用；`expectedRevision: 0`，冲突=成功。
- **M1b ✅** `index.json` 删 settings 项；四处 force-seed 清零（reset-step2 补 `ensureCanonicalSettingsForUser`）；`projectSettingsJson`、`invalidateSettingsAuditAfterFileWrite`、restore-snapshot 的 `rmSync+copyFileSync` 全删；`user-migrations.js` 改拷 `settings.migrated.json`（`SETTINGS_MIGRATION_FILE` 常量），shadow import 泛化为候选源列表——contract 路径优先，ephemeral 源导入成功后即焚，ledger `sourcePath` 用逻辑常量名、`origin: 'import'`；模板迁至 `default/templates/settings.json`，新增 `getDefaultTemplateFile()`；migration **v12** `resolve_stale_settings_projection_repairs` 解决存量 open repair；`slices.settings.projection` 读为弃用键、warn-once 后恒返回 `off`；`CONTENT_TYPES.SETTINGS` 枚举与其 `getUserTargetByType` 分支删除。
- **M2 ✅** `/get` 文件兜底分支删除（`canonical_flags_unavailable` 现在与其它 reason 一样 503）；`backupUserSettings` 文件拷贝兜底删除（仅 canonical payload 物化）；settings slice `getBackupManagedPaths` → `[]`；`settings-get-route.test.js` 重写为 canonical 夹具（`COMMAND_LINE_ARGS` + env + storage 目录）。
- **M3 ✅** 文档改写：`.docs/db/pages/settings.md`（Bootstrap/File role/Snapshots/Flags off 四段重写）、`.docs/project-overview.md`、`.docs/tech/canonical-sqlite-storage-roadmap.md:412,492`、`.docs/db/features/reply-pipeline.md`、`docs/reply-pipeline-design.md`。
- **保留**：`SETTINGS_FILE` 常量（contract 路径名 + 模板文件名两用）；`canonical-sqlite-export.js` 的有意导出；`auditCanonicalSettingsShadowImport` 的 contract 路径探测（audit-stale 兼容，D2=B）。
- **D1=A**（删分支，503 收敛）、**D2=B**（文件惰性，audit-stale 覆盖风险保留并记录在案）、**D3**（模板挪 `default/templates/`）。
- **secrets 衔接**：`secrets.json` 同构——下次移除时复用同一清单（index/播种点、投影函数、兜底分支、repair 迁移、managed paths、弃用键）。

## 目标

用户目录下的 `settings.json` 文件彻底消失：EmberDesk 不创建、不回写、不读取、不依赖它。canonical `storage/emberdesk.sqlite` 的 `settings_documents` 表是唯一权威存储。

**非目标**：

- 默认值模板数据保留（见 D3——但挪出 `default/content/` 语义区）。
- 导出功能（`canonical-sqlite-export.js`）有意物化的 `settings.json` 属于用户主动导出产物，保留。
- 已存在用户目录里的残存文件不主动删除（无害化）；**但注意：一旦 audit 转 stale，残存文件会被覆盖式 upsert 灌库——这是现存风险，不是本方案引入的，见风险表**。
- `secrets.json` 是同构问题（同 slice 机制、`defaultProjection:'off'`、同 shadow import + operator repair + backup managed path）。本方案只做 settings，但 M3 记录"secrets 复用同一模板"的衔接点。

## 现状盘点（已按代码逐条核实）

### 文件的全部现存角色

| 角色 | 位置 | 状态 |
|---|---|---|
| 投影回写 | `src/endpoints/settings.js` `projectSettingsJson` | **已死**：settings slice `defaultProjection:'off'`，函数提前 return；代码路径仍在 |
| 新用户播种 | `default/content/settings.json` + `src/endpoints/content-manager.js:25` `seedContentForUser`（**模板复制语义**：目标不存在时从 `default/content/index.json` 声明的模板复制，**不扫描用户文件**） | **承重**：新用户首启靠它落文件 → shadow import 灌库 |
| 强制播种调用点 | `users-public.js:396`（首启建管理员）、`users-admin.js:211`（建用户）、`users-private.js:185`（reset-settings）、`users-private.js:261`（reset-step2 全量重置，非强制） | **承重**：M1 删 index.json 项后这些 `forceCategories` 变空操作；reset-step2 还会连带删 `storage/emberdesk.sqlite`——"无文件建文档"的另一必测入口 |
| 迁移/导入源 | `canonical-settings-shadow-import.js`（文件→sqlite）、`user-migrations.js:84`（旧版 `public/settings.json` → 用户根拷贝） | **承重但条件苛刻**：导入与否由 `decideCanonicalBackendInitAction`（`canonical-backend.js:107-122`）按 audit 状态机决定——clean audit = `skip`，文件存在也**不会**被导入；`audit_stale*` 才触发，且是**覆盖式** `upsert`（shadow-import.js:202-233） |
| 兜底文件读 | `settings.js` `/get` 的 `canonical_flags_unavailable` 分支 | **仅测试可达**：`server.js:8-10` 无条件设 `COMMAND_LINE_ARGS`，`canReadCanonicalFeatureFlags()`（settings.js:256-261）因此恒 true；生产走不到。且文件缺失时 readFile 抛错被外层 catch 吞成 500（无 reason），比 503 更差 |
| 兜底文件写 | `settings.js:566-575` `/save` 同分支 | **静默丢写**：写完调 `invalidateSettingsAuditAfterFileWrite`，但该函数第一件事就是 `canReadCanonicalFeatureFlags()`（settings.js:460-462），不可读直接 return → audit 永不置 stale → 恢复后 `skip` → **用户保存被永久丢弃**。函数仅存在于不可达分支内 = 死代码 |
| 兜底文件写之二 | `settings.js:870-876` `restore-snapshot` 同分支 | `rmSync` + `copyFileSync` 覆盖用户根 settings.json——第三条文件写路径 |
| `/reset-settings` | `users-private.js:183-185` 删文件 + force-seed SETTINGS | **已坏**：canonical 权威下删文件不动 DB 文档，设置没被重置；且 force-seed 还会重新生成文件 |
| 备份 | `backupUserSettings` 文件回退（settings.js:139-150）、开机全量 `backupSettings()`（settings.js:90-100） | 内容已优先取 canonical payload（`readCanonicalSettingsBackupPayload`），文件是次要回退；`settings_*.json` 备份名只是命名约定 |
| 受管路径声明 | `canonical-storage-slice-registry.js:210` `getBackupManagedPaths` | **不是声明面**：喂给 `buildCanonicalBackupManifest`/`getCanonicalBackupRestoreReadiness`（registry:206-211、450-479、485+），驱动 operator `missingPaths` 就绪报告（`canonical-sqlite-operator.js:356-366`）。移除后 `managedPathCount` 语义需重定义 |
| 修复工具 | `canonical-sqlite-operator.js:886` | 投影修复器读文件——随投影角色消亡退役；**但存量 open repair 行会堵写**（见 C4） |
| 常量 | `constants.js:8` `SETTINGS_FILE` | 引用面随上面收敛 |

### 核心约束

- **首启链**：新用户 `/get` → `ensureCanonicalSliceBackend` → shadow import（读播种文件建文档）。无文件且无文档 → `settings_document_missing` → **503**。
- **`shadowImport` 是可配置 flag**（`storage-feature-flags.js:51`）：`runCanonicalSettingsShadowImport` 在 `shadowImport:false` 时直接 skip（`canonical-backend.js:155-158`）。所以 bootstrap 不能挂在 shadow import 里（C1）。

## 分阶段方案

### M0：语义修复（前置，独立价值）

`/reset-settings` 改为**重置 canonical 文档**：

- 调用 `upsertCanonicalSettingsDocument` 写入默认 payload（文档不存在则 rev=1 新建——新用户 reset 也是合法路径）；`settings_snapshots` **保留**（重置不毁用户历史快照）；
- **同时删掉 `users-private.js:185` 的 force-seed SETTINGS**——否则"重置"会重新生成 settings.json，与 M1 直接冲突；
- **不动文件**（C7）：删除文件留到 M1/M3——文件在 audit-stale 路径下仍是迁移输入，M0 删它会顺带抹掉该输入；
- 测试先行：复用 `tests/canonical-settings-store.test.js` 的 `seedSettingsDocument` + `invokeRoute` 夹具——先证明当前实现 reset 不生效（删文件后 `/get` 仍返回旧设置），修复后断言文档回到默认 + rev 正确。

### M1a：无文件建文档（行为零变化，播种仍保留）

抽出**不依赖任何 flag** 的 `ensureCanonicalSettingsDocument()`（`expectedRevision:0` 创建；revision 冲突视为成功——并发幂等）：

- 在 `getCanonicalSettingsReadState`/`WriteState` 中 `ensureCanonicalSliceBackend` 之后调用——无论 shadow import 是否开、audit 何态，读/写路径都能建文档；
- 在两个建用户入口（`users-public.js` 首启管理员、`users-admin.js` 建用户）显式调一次，消除"种子落地前的 503 窗口"；
- **默认值来源**：以 `default/content/settings.json` 为模板源（见 D3 归置），建文档时直读模板——**不经过用户根文件**；
- 验证：此时播种仍在跑，行为零变化——只证明"无文件也能建文档"这条路径成立。

### M1b：停止产生（文件不再出现在用户目录）

| 改动 | 落点 | 说明 |
|---|---|---|
| 播种移除 | `default/content/index.json` settings 项 | 新用户不再落文件；四处 force-seed 变 no-op，逐个改为调用 `ensureCanonicalSettingsDocument`（或直接删除调用点） |
| shadow import 输入泛化 | `canonical-settings-shadow-import.js` `getSettingsFilePath()`（:22-24 硬编码 `root/settings.json`） | 泛化为接受任意 `sourcePath`：模板播种 / `public/settings.json` 旧版迁移都用同一入口；**ledger 语义要定义**：`origin` 目前仅 `import/projection/export`（`canonical-import-ledger.js:69-72`）——模板播种记 `origin:'seed'`，`sourcePath` 用逻辑常量（如 `default:settings`）而非绝对路径，避免 `classifyImportCandidate` 键随部署路径漂移。模板读取复用 `getDefaultPresetFile()`（`content-manager.js:119-133`） |
| `user-migrations.js:84` | 纯文件迁移函数，跑在 `initDataPhase`（server-main.js:492），无 DB 句柄 | **取舍**：A) 给它注入 DB open+migration+upsert 直导（耦合重）；B) 保留"拷到用户根由 shadow import 拾取"——但这违反 M1"不再出现文件"；C) **推荐**：改为拷到临时内部路径（非用户根 convention），由泛化 import 拾取后即焚——文件只在迁移窗口瞬态存在于非约定路径 |
| 投影写路径删除 | `projectSettingsJson` + 全部调用点 + `invalidateSettingsAuditAfterFileWrite`（死代码）+ `restore-snapshot` 兜底分支的 `rmSync/copyFileSync`（settings.js:870-876）| 三条文件写路径全清 |
| 存量 open repair 行处理 | `settings_projection_repairs` settings 行 | **必须处理**（C4）：writes 阶段把 open repairs 当 blocker（`canonical-sqlite-rollout-contract.js:206-223`），`/save` 会一直 503 `open_settings_projection_repairs`（settings.js:376-393）。方案：迁移时把存量 open settings repair 标 resolved；**或** projection 路径删除后把该 code 从 settings 的 blocker 集合摘除 |
| projection 配置键 | `slices.settings.projection` | 读到时警告并忽略（C5）；M3 宣布键废止写入 docs |

### M2：移除读取面

| 改动 | 落点 | 说明 |
|---|---|---|
| 三个兜底文件分支 | `/get`（settings.js:597）、`/save`（settings.js:566）、`restore-snapshot`（settings.js:870）的 `canonical_flags_unavailable` | 生产不可达，删之即可——分支语义改为"与其它 reason 一致 503"。**注意**：`tests/settings-get-route.test.js:47-52` 当前靠此分支拿 200，须重写夹具为 canonical 路径 |
| `canReadCanonicalFeatureFlags`/文件回退残留 | settings.js 各分支 | 随分支删除收敛 |
| 受管路径重定义 | `getBackupManagedPaths` settings 条目 | settings 不再声明磁盘路径——`managedPathCount`=0；确认 operator `missingPaths` 报告与 backup manifest 对 0 条目的语义正确（不报告缺路径即就绪） |

### M3：清理与文档

- `constants.js` `SETTINGS_FILE`：仅剩迁移内部引用或删除；
- `slices.settings.projection` 配置键宣布废止（C5 收尾）；
- **文档点名**（v1 太笼统）：
  - `.docs/db/pages/settings.md:77`（Projection 段）与 `:79`（Flags off 段）——两条必须改写；
  - `.docs/project-overview.md:106`；
  - `.docs/tech/canonical-sqlite-storage-roadmap.md:412,492`；
  - `.docs/db/features/reply-pipeline.md:24`；
  - `AGENTS.md`「projections」表述按 slice 细化；
- **测试点名**：
  - `tests/default-content-seeding.test.js:78`——直接断言 settings.json 落盘，需重写为断言 sqlite 文档；
  - `tests/settings-get-route.test.js:50`——夹具重写（canonical 路径）；
  - `tests/canonical-backend.test.js:64`、`tests/canonical-storage-slice-registry.test.js:59`；
  - `tests/canonical-settings-store.test.js`（约 18 处引用）；
  - `tests/canonical-sqlite-export.test.js`；
- secrets 衔接：本方案的 slice 机制、投影模式、repair/backup managed path 与 `secrets.json` 同构——M3 记录模板化清单，下次做 secrets 直接复用。

## 决策点（已按核对修正）

- **D1 兜底分支去向**——降级为**测试契约问题**（生产不可达）。倾向 A：删除分支，与 503 reason 收敛。支撑论据强化：该分支写文件是**静默丢写**（audit 永不 stale，保存永久丢弃），比"读到陈旧值"恶劣得多；且文件缺失时 readFile 抛错被吞成 500 无 reason，行为本就更差。
- **D2 文件导入通道**——重写：现状是"无隐式通道（clean audit 下丢文件不会被导入）+ audit-stale 时覆盖式 upsert 风险"。选项：A) 新增**显式**一次性导入入口（operator CLI / 设置页按钮），语义明确可审计；B) 宣布文件彻底惰性 + 把覆盖风险写进风险表（不新增入口，audit-stale 覆盖行为随 shadow import 保留作迁移期兼容）；C) 连 audit-stale 的 settings 文件导入也拆（shadow import 只认模板/旧版路径）。倾向 B 起步、A 作为后续增强——因为"通道"本来就不存在，B 是最诚实的现状声明。
- **D3 模板归置**——收敛为：A) 挪出 `default/content/` 语义区（如 `default/defaults/settings.json`）+ index.json 移除条目——目录语义自洽，防止被重新当播种项加回；B) 保留在 content 目录但 index.json 保留标 `bootstrap` 注释项。倾向 A；~~C) 移入代码常量~~已否决（数据不该变逻辑）。

## 风险

| 风险 | 缓解 |
|---|---|
| M1b 后新用户首启 503 | M1a 先落地 `ensureCanonicalSettingsDocument` 并证明；M1b 的播种删除与建文档路径必须同版本到位 |
| 存量 open repair 行堵死 `/save` | C4 方案随 M1b 同批落地（标 resolved 或摘 blocker code），漏做则该部署永远无法保存 |
| `/reset-settings` 当前已坏 | M0 测试先行证实并修复 |
| 残存文件在 audit-stale 时被覆盖式灌库 | **现存风险，非本方案引入**：D2-B 把它写进文档；D2-A 的显式入口能根治 |
| 并发首建文档（`/get` 与 `/save` 竞争） | `expectedRevision:0` + 冲突视为成功保证幂等；补并发测试 |
| 回滚到旧版本 | M1b 删 index.json 项后，旧版会按自己的 index.json 重新播种文件——**回滚=部署旧版，需确认旧版不依赖新 sqlite 文档被读**；文档写明：回滚后 settings.json 会重新出现并重新成为影子输入，属预期兼容行为 |

## 验证清单

- [ ] 新数据根冷启动：无 `settings.json` 生成，`/get` 返回默认，rev=1（M1a 后即应通过）
- [ ] 旧目录（含 settings.json）升级：audit 状态机决定导入，文件不再被回写
- [ ] 旧目录无文件升级：`ensureCanonicalSettingsDocument` 建默认文档
- [ ] `/reset-settings`：文档重置为默认、rev 递增、快照保留、无文件再生
- [ ] `reset-step2`（users-private.js:261）：连 sqlite 一起删后重建——无文件建文档必测入口
- [ ] 并发幂等：`/get` 与 `/save` 同时首建文档不冲突
- [ ] `/save` + 重启：settings 只在 sqlite；`grep` 用户根无 settings.json
- [ ] 存量 open `settings_projection_repairs` 行不再阻塞 `/save`
- [ ] 导出功能仍产出 settings.json（用户主动行为）
- [ ] operator `missingPaths`/`managedPathCount` 对 settings 0 受管路径语义正确
- [ ] 点名测试全改绿；`test:compat`、canonical slice 单测、e2e 冒烟
- [ ] `grep SETTINGS_FILE`：仅剩迁移/导出内部引用
- [ ] 回滚演练：部署旧版后行为符合"文件重新播种"预期

## 复审驱动的加固（实施后追加）

四路独立 review 后落地的修正，全部有回归测试钉住：

- **`ensureCanonicalSliceBackend` 缓存毒化**（critical）：`closeCanonicalDatabase`（reset-step2）或任何 init 失败曾会把"已关闭句柄 / rejected promise"永久缓存——该用户所有 canonical 端点持续 500 直到重启。修复：`prev.db.isOpen !== false` 守卫关闭句柄走重新初始化；rejected init promise 自动逐出缓存，瞬时失败不再毒化。
- **快照端点契约统一**：`/make-snapshot` 在 canonical 不可用时曾返回 204 却什么都没写；`/restore-snapshot` 的 `canonical:` 分支用 409 而文件分支用 503。现在统一为 503 `canonical_storage_unavailable`，不再有"假装成功"。
- **`settings.migrated.json` 审计可见性**：搁浅或损坏的迁移文件此前静默丢失（contract 路径审计看不见它，clean audit 后永不再导）。现在 audit 会产生 suppressed 的 `pending_migration`/`invalid_json` 条目——不阻塞写、在 operator status 中可见；损坏文件保留供人工恢复，绝不自动销毁。一次性导入语义维持：clean audit 后丢入的文件不会触发导入。
- **烧录失败不再误报**：`consumeCandidate` 的 rmSync 失败曾把已成功的导入标成 error；现在降级为 warn，文件留待下轮重试。
- **`ensureCanonicalSettingsDocument` 防御**：非对象 defaults（模板损坏返回数组/字符串）收敛为 `{}`，不会原样写库。
- **writeState 全覆盖**：`getCanonicalSettingsWriteState` 现在同样执行 `ensureCanonicalSettingsDocument`——`/make-snapshot` 对无文档用户不再抛 500。
- **建用户入口**：`ensureCanonicalSettingsForUser` 的 `{ok:false}` 返回值在 public/admin/reset-step2 三处均转为 warn 日志，不再静默。
- **工具脚本**：`scripts/seed-dev-environment.mjs`、`startup-performance-runner.mjs`、`interaction-performance-runner.mjs` 改为直写 canonical 文档（DatabaseSync + migrations + upsert），不再落 `settings.json`。
- **测试加固**：并发首建断言单行 + 获胜载荷；`/setup` 断言 bootstrap 被调用；warn-once 有独立测试（新增 `resetDeprecatedSettingsProjectionWarningForTests`）；`migrateUserData` 落点名测试；operator repair 断言不写文件；修复两处 env 泄漏（`CHATS_SHADOWIMPORT` 未清、顶层 `ENABLED` 常设）；configRoot/目录夹具清理补齐。
