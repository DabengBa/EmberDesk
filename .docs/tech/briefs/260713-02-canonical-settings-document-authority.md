---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-settings-document-authority
status: delivered
---

# Canonical Settings Document Authority Intent

## 目标结果

让 SQLite 成为完整 settings document、revision 和 snapshot/restore 的权威源，同时保持
`/api/settings/get`、`/save`、React Settings、legacy drawer 和 startup events 的 payload
兼容。

## 约束

- 初次切换保留 `power_user.personas`、`extension_settings` 和 `background` 嵌套结构。
- Secrets 不进入 settings document。
- 必须解决整文档 last-write-wins 风险，提供 revision conflict 和明确恢复路径。
- Preset/theme/world-name directory payload cache 仍是独立读取聚合，不混成 settings authority。

## 验收标准

- DB-first read/write、snapshot/restore、file projection 和 rollback 均有独立 proof。
- 多设备旧 revision 保存不能静默覆盖较新 document。
- 当前启动顺序和 `SETTINGS_LOADED*` 事件不变。

## 参考资料

- `src/endpoints/settings.js`
- `src/endpoints/settings-cache.js`
- `public/script.js`
- `.docs/db/pages/settings.md`

## Delivery Trace

- Code: `src/endpoints/settings.js`, `src/endpoints/settings-store.js`, `src/canonical-settings-shadow-import.js`, `src/canonical-sqlite-migrations.js` (v4), `src/canonical-storage-slice-registry.js`, `src/canonical-sqlite-operator.js`
- Tests: `tests/canonical-settings-store.test.js` plus related settings/canonical control-plane suites
- Owning docs: `.docs/db/pages/settings.md`, `.docs/tech/canonical-sqlite-storage-roadmap.md`, `.docs/PROJECT_HISTORY.md`
- Delivered: 2026-07-13
