# Canonical Extension Storage Authority 迁移

## 意图与核心流程

一句话意图：把 extension storage 纳入 canonical SQLite authority，同时冻结并保护第三方扩展可见 API、mount points、`@sillytavern/*` aliases、regex/slash/event surfaces。

主要参与者或触发条件：

- personas/backgrounds canonical migration 已完成
- structured user-data slices 进入 extension storage 阶段
- 维护者需要清除 extension settings/files 的 legacy authority，但不能破坏 JS-Slash-Runner 等兼容面

主路径顺序：

1. 盘点 `src/endpoints/extensions.js`、`public/scripts/extensions.js`、built-in extensions 和第三方兼容文档。
2. 将 first-party extension settings、extension-managed metadata、install/update state 纳入 canonical schema。
3. 对第三方扩展数据采用 manifest-declared 或 namespace-scoped storage contract，避免不透明写入破坏兼容。
4. Shadow import existing extension settings/storage。
5. DB-first reads/writes behind flags，并保持 protected mount points 和 browser API 不变。
6. 增加 compatibility tests 与 runtime evidence，尤其是 JS-Slash-Runner、regex、slash、event surfaces。

## 范围 / 不做范围

本次要改变什么：

- extension settings/storage authority 迁移到 canonical SQLite。
- install/update/delete state 纳入 operator-visible canonical status。
- extension storage drift 有 audit 和 repair path。

明确推迟什么：

- 不删除 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*` 或 `/lib.js`。
- 不把 `__emberDeskReactCompatibilityBridge` 变成 public extension API。
- 不迁移 chat message bodies。

第一个可交付切片：

- 先迁移 first-party extension settings 和 install/update state；第三方 extension opaque data 只在 namespace contract 明确后迁移。

## 边界规则 / 验收

验收项：

1. `#extensions_settings`、`#extensions_settings2`、`#regex_container`、wand menu mount points 保持。
2. `@sillytavern/*` imports、slash exports、regex exports、`eventSource` / `event_types` 行为不变。
3. JS-Slash-Runner 能继续 mount、读取事件、使用 slash/regex surfaces。
4. Extension settings DB-first write 成功后，canonical DB 是 authority；compat projection 保留。
5. Third-party opaque storage 未声明 contract 时不得强制迁移。
6. Flag off 或 bundle failure 时 protected legacy extension surfaces 仍可用。

失败边界：

- 任何破坏 JS-Slash-Runner 的 import、mount、event、slash、regex 行为都阻塞交付。
- 任何把 internal React bridge 当成 extension storage API 的实现都阻塞交付。

## 架构 / 约束

- 以 `.docs/tech/third-party-extension-compatibility.md` 为硬边界。
- Extension storage schema 必须 namespace-scoped，避免不同扩展互相污染。
- Secrets 仍由 secrets authority/SecretManager 管，不混入 extension storage。
- React Extensions Host 仍只是 visible host/action path，不替代 protected mount nodes。

## 数据 / 集成

建议 schema 方向：

- `extension_storage(namespace, key, payload_json, updated_at_ms)`
- `extension_install_state(extension_id, source, version, metadata_json, updated_at_ms)`
- `extension_projection_repairs(...)`
- `canonical_audit_state` slice key 增加 `extension_storage`

集成点：

- `src/endpoints/extensions.js`
- `public/scripts/extensions.js`
- `public/scripts/extensions/regex/*`
- `public/scripts/extensions/third-party/JS-Slash-Runner/`
- `tests/third-party-extension-compatibility.test.js`
- `tests/extension-repo-update-state.test.js`

## 验证

执行：

```bash
bun run test:compat
bun run --cwd tests test:unit -- extension-repo-update-state.test.js workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js --runInBand
bun run docs:check
```

新增 focused proof：

- extension storage migration idempotency
- first-party extension settings read/write parity
- JS-Slash-Runner mount/import/event smoke
- regex/slash public export stability
- namespace collision prevention

## Doc ID 契约

- `feature.extension_panel_open`：extension panel user-facing surface。
- `term.shared_browser_library`：`/lib.js` public import surface。
- 如新增 operator-facing term，可新增 `term.canonical_extension_storage`。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/features/extension-panel-open.md`
- `.docs/db/terms/shared-browser-library.md`
- `src/endpoints/extensions.js`
- `public/scripts/extensions.js`
- `tests/third-party-extension-compatibility.test.js`
- `public/scripts/extensions/third-party/JS-Slash-Runner/`
