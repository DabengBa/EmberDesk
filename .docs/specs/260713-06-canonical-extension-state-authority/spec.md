# Canonical Extension State Authority

## 意图与核心流程

一句话意图：让 SQLite 拥有 extension registry、scope、source/revision、enabled state、namespace storage 和 repair status，同时把 Git worktree 保留为数据库管理的执行投影。

Discovery 先比较 registry 与全局/用户 extension 目录；install 在安全路径 clone 并验证 manifest 后事务登记；update/switch/move/delete 先检查 dirty、detached、upstream 与权限，再记录期望 revision 并协调 worktree；first-party namespace 数据从 settings payload 迁出，第三方 opaque data 仅在声明 contract 后接管。

## 范围 / 不做范围

本阶段包括：

- Extension identity、global/user scope、source URL、requested branch/revision、installed revision、enabled/disabled 与 manifest snapshot。
- Install/update/switch/move/delete/discover 的 registry authority 与 worktree repair。
- Namespace-scoped structured storage，优先迁移 first-party extension data。
- Protected browser surfaces 与 compatibility tests。

本阶段不包括：

- 不把 Git object/worktree 内容存入 SQLite BLOB。
- 不猜测迁移没有 manifest/namespace contract 的第三方 opaque files。
- 不删除 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`、`/lib.js`、slash/regex APIs 或 mount nodes。
- 不把 secrets 放入 extension namespace。

## 边界规则 / 验收

R1: registry 必须稳定表达 extension ID、scope、source、requested/installed revision、enabled state、manifest snapshot 和 worktree relative path；目录名不能单独充当身份。

R2: discovery audit 必须区分 registered/healthy、unregistered directory、missing worktree、revision drift、dirty、detached、no-upstream、invalid manifest 和 scope collision。

R3: install/update/switch/move/delete 在 write flag 下以 registry transaction 和明确 worktree operation state 协调；dirty/detached/no-upstream 不得被破坏性覆盖。

R4: first-party namespace storage 必须按 extension ID + namespace + key 隔离；未声明 contract 的第三方 opaque data 保持原 owner，collision 必须失败。

R5: `#extensions_settings`、`#extensions_settings2`、`#regex_container`、wand menu、`@sillytavern/*`、events、slash 和 regex 行为保持，JS-Slash-Runner compatibility gate 必须通过。

R6: worktree 操作失败必须留下可诊断 repair state；repair 不得丢弃用户 dirty changes，registry 也不得谎报 installed revision。

R7: flag off 时当前 directory discovery/settings payload 行为可用；canonical writes 后 rollback 要求 registry projection、namespace projection 与 worktrees audit clean。

## 架构 / 约束

- 依赖 settings、secrets 与 managed-file/control-plane contracts。
- `src/endpoints/extensions.js` 继续拥有 auth/permission/HTTP route；Git 状态 helper 保持独立可测。
- React Extensions Host 只是 visible host/action owner，不成为 extension protocol 或 storage API。
- Registry 路径必须在现有 user/global extension roots 下并使用现有 sanitization。

## 数据 / 集成

建议 schema：

- `extensions(id, scope, source_url, requested_ref, installed_revision, enabled, worktree_path, manifest_json, state, ...)`
- `extension_namespaces(extension_id, namespace, key, payload_json, revision, ...)`
- `extension_worktree_repairs(...)`

主要集成点：

- `src/endpoints/extensions.js`
- `src/extension-repo-update-state.js`
- `public/scripts/extensions.js`
- settings canonical adapter
- third-party extension compatibility surfaces

## 验证

```bash
bun run --cwd tests test:unit -- canonical-extension-store.test.js extension-repo-update-state.test.js workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run docs:check
```

手动覆盖 install、update、branch switch、scope move、disable/delete，以及 dirty/missing worktree 的恢复路径。

## Doc ID 契约

- `feature.extension_panel_open`：更新 extension registry 状态、操作失败与恢复语义。
- `term.shared_browser_library`：确认 `/lib.js` 与 `@sillytavern/*` 仍是兼容边界，不因 storage authority 改名或收窄。

## 参考资料

- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/features/extension-panel-open.md`
- `.docs/db/terms/shared-browser-library.md`
- `src/endpoints/extensions.js`
- `src/extension-repo-update-state.js`
- `public/scripts/extensions.js`
- `tests/extension-repo-update-state.test.js`
- `tests/third-party-extension-compatibility.test.js`
