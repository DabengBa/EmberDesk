# Canonical Personas 与 Backgrounds Authority 迁移

## 意图与核心流程

一句话意图：把 personas 与 backgrounds 的结构化 metadata 迁移到 canonical SQLite，逐步清除 legacy file authority，同时保持 persona selection、background gallery、lock/unlock/autobg 和文件资产兼容。

主要参与者或触发条件：

- vectors/assets canonical migration 已完成
- 维护者继续 structured user-data slices
- personas/backgrounds 需要从 loose file/state ownership 收敛到 canonical authority

主路径顺序：

1. 盘点 `public/scripts/personas.js`、`src/endpoints/backgrounds.js`、`public/scripts/backgrounds.js` 和 background semantic docs。
2. 设计 personas canonical metadata 与 backgrounds canonical metadata。
3. Shadow import existing personas/background metadata；背景图片文件本体优先保持 managed projection，不直接强制入 DB。
4. DB-first reads behind flag，保持 UI list/gallery payload 不变。
5. DB-first writes with projection and repair。
6. 更新 docs 和 tests，证明 slash/background helper flows 仍可用。

## 范围 / 不做范围

本次要改变什么：

- personas metadata authority 迁移到 canonical SQLite。
- backgrounds metadata、folder/selection/lock state authority 迁移到 canonical SQLite。
- 背景图片文件继续作为 projection/blob surface，除非 implementation proof 显示直接 DB blob 更适合。

明确推迟什么：

- 不迁移 extension storage。
- 不迁移 chat message bodies。
- 不改写 React workspace shell/panel ownership。

第一个可交付切片：

- backgrounds metadata/selection authority 优先，因为现有 background panel、slash command 和 workspace visual state 都依赖它。

## 边界规则 / 验收

验收项：

1. Persona selection、persona management 和相关 macros/slash helpers 行为不变。
2. Background gallery、folder drill-in、selection、lock/unlock、auto background 行为不变。
3. `/lockbg`、`/unlockbg`、`/autobg` 兼容语义不变。
4. DB-first writes 后，canonical DB 是 metadata authority；文件 projection failure 记录 repair。
5. Flag off 时 legacy file-backed behavior 仍可 rollback。

失败边界：

- 如果背景图片文件 projection 缺失，UI 必须显示可恢复错误或 fallback，不得静默选择不存在图片。
- 如果 persona state 与 chat/session state 冲突，必须记录 audit drift 并阻塞 write cutover。

## 架构 / 约束

- 不把 binary background assets 强制塞入 SQLite，除非 proof 证明性能和 backup 边界可接受。
- Backgrounds visible action path 继续通过 `public/scripts/backgrounds.js` facade。
- Personas browser module 保持 current exports 和 macro/slash behavior。
- 复用 canonical rollout/audit/repair 模式。

## 数据 / 集成

建议 schema 方向：

- `persona_records(id, name, avatar_ref, metadata_json, updated_at_ms, deleted_at_ms)`
- `background_records(id, folder, filename, blob_ref, metadata_json, updated_at_ms, deleted_at_ms)`
- `background_state(handle, selected_background_id, locked_background_id, metadata_json, updated_at_ms)`
- projection repair table 扩展 slice key

集成点：

- `public/scripts/personas.js`
- `src/endpoints/backgrounds.js`
- `public/scripts/backgrounds.js`
- `public/scripts/background-panel-controller.js`
- `tests/background-panel-controller.test.js`

## 验证

执行：

```bash
bun run --cwd tests test:unit -- background-panel-controller.test.js thumbnail-lazy-image-loading.test.js thumbnail-cache-headers.test.js --runInBand
bun run test:compat
bun run docs:check
```

新增 focused proof：

- persona metadata migration parity
- background metadata migration parity
- selected/locked background state rollback
- projection failure repair
- slash command compatibility for background actions

## Doc ID 契约

- `feature.background_library_panel`：background gallery/action surface。
- `page.chat_workspace`：background/persona interaction entry。
- 如 persona semantic doc 不存在，implementation 若改变用户可见 persona workflow，应先新增或更新对应 `.docs/db` owner。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/db/features/background-library-panel.md`
- `public/scripts/personas.js`
- `src/endpoints/backgrounds.js`
- `public/scripts/backgrounds.js`
- `tests/background-panel-controller.test.js`
