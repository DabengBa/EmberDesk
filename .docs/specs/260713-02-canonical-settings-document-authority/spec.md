# Canonical Settings Document Authority

## 意图与核心流程

一句话意图：让 canonical SQLite 成为完整 settings document、revision 与 snapshot/restore 的权威源，同时保持当前 `/api/settings/get`、`/save`、React Settings、legacy drawer 和启动事件契约。

用户加载设置时，服务端从 audit-clean 的 canonical document 读取，并继续组合 presets、themes、world names 等目录派生 payload；用户保存时必须携带或由兼容适配器解析 revision，数据库事务成功后再投影 `settings.json`；冲突、投影失败和恢复均返回明确状态。

## 范围 / 不做范围

本阶段包括：

- 完整 settings JSON document、revision、更新时间和 snapshot authority。
- `settings.json` shadow import、双向 audit、DB-first read/write、compatibility projection、repair 和 rollback。
- 旧客户端无 revision 的兼容策略与多设备 stale-write 冲突。
- 初始保留 `power_user.personas`、`power_user.persona_descriptions`、`extension_settings` 和 background state 的现有嵌套 shape。

本阶段不包括：

- 不迁移 secrets。
- 不在本阶段规范化 personas、extension namespace 或 managed media。
- 不把 preset/theme/world-name 目录聚合缓存并入 settings document。
- 不重写 React/legacy settings UI ownership。

## 边界规则 / 验收

R1: `settings.json` shadow import 必须幂等，保留未知字段与完整 JSON shape；audit 能区分未导入、DB/file drift、无效 JSON 和 schema 未就绪。

R2: audit-clean 且 read flag 开启时，`/api/settings/get` 的 `settings` 字符串与现有文件路径语义等价，目录聚合字段和启动顺序不变。

R3: canonical save 必须使用单调 revision；旧 revision 保存返回冲突与最新 revision，不得静默覆盖较新 document。

R4: DB commit 是 write flag 开启后的 authority boundary；`settings.json` 投影失败必须记录 repair、阻断 rollback，并不得回退为文件写成功。

R5: snapshots 必须从 canonical revision 创建并可预览/恢复；恢复产生新 revision，不回拨 revision 计数，且保持当前备份保留策略可迁移。

R6: flag off 时现有原子 `settings.json` 读写继续可用；从 canonical writes 回滚前必须 audit clean 且无 open repair。

R7: `SETTINGS_LOADED_BEFORE`、`SETTINGS_LOADED_AFTER` 及 React/legacy settings 可见字段行为保持，普通 settings payload 不含 secret 明文。

## 架构 / 约束

- 依赖 `260713-01-canonical-storage-control-plane` 的 slice gate。
- settings document 先作为完整 JSON 保存，避免在同一阶段拆散所有嵌套 owner。
- revision conflict 应在 endpoint/service 边界可测试；不依赖浏览器时间戳。
- `src/endpoints/settings-cache.js` 继续只缓存目录派生 payload。
- 原子文件投影和 filename validation 沿用现有 helper。

## 数据 / 集成

建议 schema：

- `settings_documents(user_id, revision, payload_json, content_hash, updated_at_ms)`
- `settings_snapshots(id, source_revision, payload_json, content_hash, created_at_ms)`
- `settings_projection_repairs(...)`

`/api/settings/get` 可增加兼容安全的 revision 字段；`/save` 接受 revision。旧客户端缺少 revision 时，只允许在服务端确认其基线等于当前 document 的兼容窗口内保存，否则返回 conflict。

主要集成点：

- `src/endpoints/settings.js`
- `src/endpoints/settings-cache.js`
- `public/script.js`
- React settings page/controller

## 验证

```bash
bun run --cwd tests test:unit -- canonical-settings-store.test.js settings-get-route.test.js settings-cache.test.js settings-react-route.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js --runInBand
bun run docs:check
```

手动证明两个浏览器会话基于同一 revision 加载，后保存的 stale 会话得到 conflict 且可重新加载，不覆盖先保存内容。

## Doc ID 契约

- `page.settings`：更新其存储、保存冲突、snapshot/restore 与 rollback 行为；绑定点保持 React Settings route 与 legacy settings facade。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/db/pages/settings.md`
- `src/endpoints/settings.js`
- `src/endpoints/settings-cache.js`
- `public/script.js`
- `tests/settings-get-route.test.js`
- `tests/settings-cache.test.js`
- `tests/settings-react-route.test.js`
- Inference: revision 是解决当前整文档原子覆盖在多设备场景下 last-write-wins 的最小新增合同。
