---
created: 2026-07-14
source: user
confirmed: true
last_updated: 2026-07-15
feature_slug: extension-operation-safety
status: delivered
---

# Extension Operation Safety Intent

## 目标结果

不建立错误的 per-user canonical extension registry，只强化现有 filesystem/Git authority
下 install/update/switch/move/delete 的 preflight、结构化失败和无损恢复。

## 代码事实

Global extensions 是 server-wide，user extensions 是 per-user；二者都由目录和 Git
worktree discovery 驱动。`extension_settings` 已由 canonical settings document 保存。

## 约束

- dirty、detached、no-upstream、missing worktree、invalid manifest、scope collision 必须
  在破坏性操作前被识别。
- 不丢弃用户 Git changes，不自动 hard reset。
- protected mount points、events、slash、regex、`@sillytavern/*` 和 `/lib.js` 保持。
- global registry 若未来数据库化，需另立 ADR。

## 验收标准

- 所有 mutation routes 使用同一 preflight/result contract。
- UI 可区分可重试、需用户处理和不允许执行的失败。
- 用户 scope move 与 global scope 权限边界有 focused proof。

## 非目标

- 不迁移 extension registry/namespace 到 SQLite，不改变 discovery authority。

## Delivery Trace

- Code: `src/extension-operation-safety.js`, `src/endpoints/extensions.js`, `public/scripts/extensions.js`
- Tests: `tests/extension-operation-safety.test.js`, `tests/extension-repo-update-state.test.js`
- Owning docs: `.docs/db/features/extension-panel-open.md`, `.docs/db/terms/shared-browser-library.md`, `.docs/tech/third-party-extension-compatibility.md`
- History: `.docs/PROJECT_HISTORY.md` entry for Extension operation safety (2026-07-15)
