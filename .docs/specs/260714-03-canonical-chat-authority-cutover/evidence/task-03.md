# Task 03 Evidence

## Rollout And Rollback Gates

- `canonical-storage-slice-registry.test.js` verifies:
  - `writes=true` with `reads=false` is rejected as
    `illegal_flag_combination:writes`;
  - a clean persisted chat audit permits the chat write phase;
  - an open `chat_projection_repairs` row blocks the write/rollback phase as
    `open_chat_projection_repairs`.
- `canonical-sqlite-operator.test.js` verifies a failed chat projection can be replayed
  from canonical rows and is resolved only after the JSONL projection is restored.
- `canonical-sqlite-cli.test.js` verifies repair CLI discovery now includes
  `list-chat-repairs` and `repair-chat-projection`.

## Browser And Compatibility Proof

- `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-streaming.e2e.js chat-message-layout.e2e.js`
  passed 24 tests; 6 React-flag conditional tests were skipped.
- `bun run test:compat` passed 8 protected extension, slash, event, and selector
  compatibility tests.
- `bun run docs:check` validated all 30 semantic docs.
- Scoped lint for the touched production files passed:
  `bunx eslint src/endpoints/chats.js src/endpoints/canonical-chat-read-service.js src/endpoints/canonical-chat-write-service.js src/endpoints/canonical-chat-store.js src/canonical-storage-slice-registry.js src/canonical-sqlite-operator.js src/canonical-sqlite-migrations.js scripts/canonical-sqlite-repair.mjs`.

## UX 走查报告

## 目标

- 功能：已存 character chat 的打开、完整消息读取与移动端阅读路径
- URL: `http://127.0.0.1:8001/`
- 用户画像：首次使用测试账号的普通用户
- 会话：Playwright 风格的隔离浏览器上下文；通过可见登录表单登录 `playwright-e2e`，结论限于登录后的 chat workspace
- 视觉检查：`/tmp/ux-walkthrough-20260715/`；实际查看
  `chat-login-baseline.png`、`chat-workspace-baseline.png`、`chat-open-desktop.png`、
  `chat-open-mobile.png`、`chat-mobile-after-close.png`
- 日期：2026年7月15日

## 逐步走查

| 步骤 | 操作 | 观察 | 是否存在摩擦 |
|------|------|------|--------------|
| 1 | 打开登录页并登录 | 登录卡片的用户名、密码和登录按钮在首屏清晰可见。 | 未观察到有意义的摩擦 |
| 2 | 从可见“角色管理”入口选择 `Dev Character 001` | 已存消息以完整、按时间顺序的稳定消息行出现，既有编辑和消息操作入口仍可见。 | 未观察到 authority 切换相关摩擦 |
| 3 | 在 375 x 812 视口关闭角色侧栏并阅读聊天 | 聊天卡片与底部 composer 同时可达，消息操作图标仍显示，没有因完整 payload 或 load-more 合同变化而出现遮挡。 | 未观察到有意义的摩擦 |

## 关键问题

1. 测试数据环境请求 `thumbnail?type=persona&file=user-default.png` 返回 404；这是 seeded persona 缺失的已知测试数据问题，不属于本次 canonical chat 路径，也未阻塞聊天打开或阅读。

## 改进建议

1. **问题**：测试 persona 缩略图缺失会在浏览器控制台留下 404。
   **位置**：Playwright seed data 的 `User Avatars/user-default.png`。
   **影响**：测试环境噪声，可能掩盖未来真正的图片加载回归。
   **修复**：在 seed 脚本中写入该默认 persona 图，或让 seed 配置引用已有默认头像。

## Full Lint Boundary

`bun run lint` remains red for 13 unrelated existing errors in `public/script.js`,
`src/canonical-managed-media-shadow-import.js`, `src/canonical-sqlite-shadow-import.js`,
`src/endpoints/character-read-service.js`, `src/endpoints/characters.js`, and
`src/endpoints/world-info-store.js`. The two errors in touched files were fixed and
the scoped lint above is green.
