# Canonical Persona Authority

## 意图与核心流程

一句话意图：将 persona identity、描述、prompt placement、default state 与 character/group connections 从 settings document 规范化到 canonical SQLite，并引用 managed persona avatar ID。

迁移先从 audit-clean settings revision 与 managed avatar catalog 建立 persona rows；settings read adapter 继续组合现有 `power_user.personas` 与 `power_user.persona_descriptions`；persona 创建、编辑、默认选择和连接操作改为 canonical transaction 后，再投影兼容 settings payload。

## 范围 / 不做范围

本阶段包括：

- Persona stable ID、avatar reference、name/title/description、position/depth/role。
- Global default persona、character/group connections 与删除级联。
- Settings payload composition/projection、shadow import/audit、repair 和 rollback。
- Persona macros、selection events 与兼容 avatar URLs。

本阶段不包括：

- 不迁移 chat-local persona lock；该状态继续属于 `chat_metadata`，由 chat authority 接管。
- 不迁移 avatar bytes；只引用 managed media ID。
- 不重写 persona UI、macros、slash 或 startup owner。
- 不将 background state 合入 persona tables。

## 边界规则 / 验收

R1: 从 settings payload 导入 personas 必须生成稳定 IDs，保留未知描述字段、default 与 character/group connections，并对缺失 avatar 给出 audit 状态。

R2: settings get/save 兼容适配器必须继续读写现有 `power_user.personas`、`persona_descriptions` 与连接 shape，同时明确 canonical rows 是 write flag 下的权威。

R3: create/update/delete/default/connect/disconnect 操作必须事务化；任意时刻最多一个有效 default，连接不得指向不存在 persona。

R4: 删除 persona 必须清理 default 和 character/group connections；chat-local lock 只能记录 dangling audit/repair intent，不能由本阶段静默改写 chat JSONL。

R5: persona selection、macros、events、prompt placement 和 avatar compatibility URL 的用户可见行为保持。

R6: settings projection 失败记录 repair 并阻断 rollback；外部 settings 修改不会自动覆盖 canonical persona rows，必须显式 import/resolve。

R7: flag off 时 settings-owned persona 行为可用；canonical writes 后回滚要求 settings projection 与 managed avatar references audit clean。

## 架构 / 约束

- 依赖 settings document authority 与 managed media authority。
- Persona store 是业务事实源；settings endpoint 只做兼容 compose/decompose。
- 不复制 chat metadata owner；chat-local locks 只在 chat spec 中改变 authority。
- 保持 `public/scripts/personas.js` exports、events 和 macro contract。

## 数据 / 集成

建议 schema：

- `personas(id, avatar_blob_id, name, title, description, position, depth, role, deleted_at_ms, ...)`
- `persona_defaults(persona_id, updated_at_ms)` 或等价单行约束。
- `persona_connections(persona_id, target_type, target_id)`
- `persona_projection_repairs(...)`

主要集成点：

- settings canonical adapter
- `public/scripts/personas.js`
- `public/scripts/power-user.js`
- `public/script.js`

## 验证

```bash
bun run --cwd tests test:unit -- canonical-persona-store.test.js settings-get-route.test.js settings-react-route.test.js chat-state-reset.test.js --runInBand
bun run test:compat
bun run docs:check
```

手动验证 persona 创建、编辑、默认、character/group connection、宏展开和删除后 reload；带 chat-local lock 的删除必须显示/记录可恢复状态。

## Doc ID 契约

- `page.chat_workspace`：记录 persona selection、prompt identity、connections 与 chat-local lock 的所有权边界；绑定点保持现有 workspace persona controls。

## 参考资料

- `.docs/db/pages/chat-workspace.md`
- `public/scripts/personas.js`
- `public/scripts/power-user.js`
- `public/script.js`
- `src/endpoints/settings.js`
- Inference: personas 从 settings document 规范化后，settings 适配器必须暂时保留原 payload，才能避免与现有启动/扩展合同同时切断。
