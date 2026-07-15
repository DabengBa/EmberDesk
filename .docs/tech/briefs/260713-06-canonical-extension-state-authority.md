---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-14
feature_slug: canonical-extension-state-authority
status: superseded
---

# Canonical Extension State Authority Intent

## 2026-07-14 结论

本 brief 已被当前代码事实取代，不再对应可执行实施包。

当前 extension discovery 同时覆盖 server-wide global extension root 与 per-user extension
root，而 canonical SQLite 是 per-user database。让 per-user SQLite 成为 global registry
权威会产生跨用户所有权、启动顺序和权限冲突。当前也没有已接受的 server-wide canonical
store 决策。

新的可执行方向由后继 intent brief
[extension-operation-safety](260714-05-extension-operation-safety.md) 与 owning tech/docs 维护：保留
filesystem/Git 作为 extension runtime authority，保留 `extension_settings` 在 canonical
settings document 内，只强化 install/update/switch/move/delete 的 preflight、结构化失败和
恢复行为。未来若要建立 server-wide extension registry，必须先单独 ADR。

旧 process directory 已在 2026-07-14 经用户确认后删除；当前结论仅由本 brief、后继
operation-safety brief、路线图和 owning docs 维护。

## 目标结果

让 SQLite 拥有 extension registry、scope、source、requested/installed revision、enabled
state、namespace storage 和 repair status；扩展 Git 工作树保留为数据库管理的执行投影。

以上是被取代的原始目标，不再是当前推荐架构。

## 约束

- `extension_settings` 初始兼容 payload 来自 settings authority，namespace data 由本阶段接管。
- Protected mount points、`@sillytavern/*`、events、slash、regex 和 JS-Slash-Runner 保持。
- 未声明 namespace contract 的第三方 opaque data 不得被猜测迁移。
- Git dirty/detached/no-upstream 状态必须阻止破坏性同步。

## 验收标准

- Install/update/switch/move/delete/discover 从数据库 registry 得到一致状态。
- Worktree missing、revision drift、dirty repo 和 namespace collision 可诊断和修复。
- Flag off 可回到当前 directory discovery 和 settings payload。

## 参考资料

- `src/endpoints/extensions.js`
- `src/extension-repo-update-state.js`
- `public/scripts/extensions.js`
- `.docs/tech/third-party-extension-compatibility.md`
