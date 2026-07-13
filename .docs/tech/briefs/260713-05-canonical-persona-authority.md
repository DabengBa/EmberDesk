---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-persona-authority
status: active
active_process_dir: .docs/specs/260713-05-canonical-persona-authority
---

# Canonical Persona Authority Intent

## 目标结果

将 persona identity、name、description、title、prompt placement、default state 和
character/group connections 从 settings document 规范化到 canonical tables，并引用
managed persona avatar identity。

## 约束

- Chat-local persona lock 当前属于 `chat_metadata`，由 chat authority spec 最终接管。
- Settings API 在迁移期间继续组合现有 `power_user.personas` 和
  `power_user.persona_descriptions` payload。
- Persona macros、events、selection 和 avatar compatibility URL 保持。

## 验收标准

- Persona create/update/delete/default/connection 行为在 DB-first 模式下保持。
- Settings projection 与 canonical persona rows 的 drift 可检测。
- 删除 persona 不会留下失效 default、connection 或 chat-lock 引用。

## 参考资料

- `public/scripts/personas.js`
- `public/scripts/power-user.js`
- `public/script.js`
- `src/user-directories.js`
