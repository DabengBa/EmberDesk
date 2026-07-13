---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
status: active
---

# EmberDesk 全面数据库化路线意图

## 用户原始请求

用户确认 EmberDesk 的长期目标是全面数据库化，并要求结合当前代码事实重新更新
`.docs/tech/canonical-sqlite-storage-roadmap.md`，重写后续独立 `spec.md` 与开发步骤文档。

## 目标结果

所有用户数据域都必须有明确的数据库权威模型。当前散落在 JSON、JSONL、图片目录、
资产目录、扩展 Git 工作树、Vectra 索引和浏览器 settings payload 中的状态，要逐阶段
迁移为：

- SQLite 拥有结构化数据、身份、关系、版本、审计状态和文件引用的权威；
- 大型图片、音频、附件和扩展 Git 工作树位于数据库管理的内容区或工作区；
- 文件不再凭存在或目录扫描自动成为权威，只能作为数据库登记的 managed blob、
  compatibility projection、import/export、backup 或 rollback surface；
- 每个数据域独立具备 migration、audit、read cutover、write cutover、projection、
  repair、rollback 和 operator proof。

## 已确认边界

- 继续使用 Node.js 26.3.0、Express 5、`node:sqlite` 和现有 per-user
  `storage/emberdesk.sqlite`。
- 不引入 PostgreSQL、外部 vector database、新 server host 或 ORM 作为本路线前提。
- `SecretManager` 继续作为 secrets 唯一 API 边界；数据库迁移不得扩大 secret exposure。
- `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`、`/lib.js`、
  slash/regex surfaces 和 protected extension mount points 保持兼容。
- Character metadata、character chat stats、full World Info 和旧
  `_cache/character-index.sqlite` 退休属于已交付回归合同，不重新写成待实现任务。
- 二进制内容默认不写入 SQLite BLOB。SQLite 持有 stable blob identity、hash、media
  metadata、ownership 和 lifecycle；内容文件位于受数据库约束的 managed content root。
- Git 仓库内容继续作为可执行工作树存在，但数据库持有 extension identity、source、
  requested revision、installed revision、scope、enabled state 和 repair status。

## 系统不变量与交付顺序

1. **Canonical storage control plane**
   - 先把现有 character/World Info 专用 rollout、audit、repair 和 rollback 机制扩展为
     可按 slice 隔离的通用控制面。
2. **Settings document authority**
   - 迁移完整 settings payload、revision、snapshot/restore 和现有嵌套配置，先保持
     payload shape，不抢先规范化每个子域。
3. **Secrets authority**
   - 独立迁移 secret records；不与普通 settings table 合并。
4. **Managed media authority**
   - 数据库接管 backgrounds、assets、persona avatars、uploads/attachments 的 catalog、
     blob identity、folder membership 和 lifecycle；内容文件进入 managed content root。
5. **Persona authority**
   - 将 persona identity、description、default/character connections 从 settings
     文档规范化到 persona tables；chat-local lock 暂留 chat metadata，等 chat spec 接管。
6. **Extension state authority**
   - 数据库接管 extension registry、install/update state、first-party/third-party
     namespace storage；Git worktree 和 protected browser surfaces 保持兼容。
7. **Chat message authority**
   - 数据库接管 character/group chat sessions、messages、swipes、chat metadata 和
     attachment references；JSONL 降为 import/export/projection。
8. **Vector catalog and derived index**
   - 最后用 canonical chat、World Info 和 managed file IDs 重建 collection/source/chunk
     catalog；embedding index 仍是可重建派生状态，不能反向成为消息或文件真源。

## 为什么采用这个顺序

- Settings、secrets、media、personas、extensions 和 chats 是事实源或用户直接维护状态。
- Vectors 来自 chats、World Info 和 files，必须在源数据身份稳定后迁移，否则会产生
  第二次 collection remap。
- Persona chat lock 和 background chat lock 当前属于 `chat_metadata`，应随 chat authority
  一起迁移，而不是在 persona/background spec 中复制。
- First-party extension settings 当前嵌在 settings payload；settings document authority
  先保持兼容，extension spec 再迁移 namespace-owned data，避免一次切断 startup contract。

## 验收标准

- Roadmap 明确八个阶段、依赖、数据库/managed-file 边界和已交付回归合同。
- 每个阶段有独立 feature brief、`spec.md`、`feature.toml`、`plan.md` 和空 `evidence/`。
- 每个 `spec.md` 可独立实施、回滚和验证，不以其它阶段的名称相似性替代真实依赖。
- 所有旧 `260708-03` 至 `260708-07` 路径被清除或改指 durable owner。
- `check_feature_links.py`、`check_plan.py`、`detect_stage.py --expect-stage implementation`、
  `bun run docs:check` 和 `git diff --check` 通过。

## 非目标

- 本轮不修改运行时代码、schema、配置或测试。
- 不在 roadmap 文档阶段承诺把二进制内容写入 SQLite BLOB。
- 不把 vector embedding index、thumbnail cache 或 generated projection 提升为用户事实源。
- 不删除 compatibility files、JSONL export、extension worktree 或 protected browser APIs；
  删除条件由各独立 spec 的验收和后续证据决定。

## 未决事项与默认假设

- 用户未进一步指定 BLOB 策略，当前采用“DB 权威 + managed content files”默认。
- SQLite at-rest encryption 不在现有仓库能力内。Secrets spec 保持当前 exposure 等价，
  不把“迁入 SQLite”表述为自动获得加密。
- 全面数据库化是长期目标；每个阶段仍需通过自己的数据审计和 rollback gate 后才能启用。

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/interaction-performance-indexing.md`
- `src/canonical-sqlite.js`
- `src/canonical-sqlite-migrations.js`
- `src/canonical-sqlite-rollout-contract.js`
- `src/canonical-sqlite-operator.js`
- `src/endpoints/settings.js`
- `src/endpoints/secrets.js`
- `src/endpoints/assets.js`
- `src/endpoints/backgrounds.js`
- `src/endpoints/extensions.js`
- `src/endpoints/chats.js`
- `src/endpoints/vectors.js`
- `public/script.js`
- `public/scripts/personas.js`
- `public/scripts/backgrounds.js`
- `public/scripts/extensions.js`
