---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-extension-state-authority
status: active
active_process_dir: .docs/specs/260713-06-canonical-extension-state-authority
---

# Canonical Extension State Authority Intent

## 目标结果

让 SQLite 拥有 extension registry、scope、source、requested/installed revision、enabled
state、namespace storage 和 repair status；扩展 Git 工作树保留为数据库管理的执行投影。

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
