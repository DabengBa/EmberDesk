# Extension Operation Safety

## 意图与核心流程

一句话意图：保留 filesystem/Git extension authority，统一 install/update/switch/move/delete
的 preflight、结构化失败和无损恢复。

每个 mutation 先解析 user/global scope、受保护路径、manifest 与 Git state，再返回统一
operation decision。只有 clean/allowed 状态才执行；dirty、detached、no-upstream、
missing、invalid 或 collision 状态返回稳定 reason/action hints，不自动覆盖用户工作树。

## 范围 / 不做范围

本阶段包括：

- Install/update/switch/move/delete/discover 的共享 preflight/result contract。
- Dirty/detached/no-upstream/missing/invalid-manifest/scope-collision handling。
- Route error envelopes、frontend action feedback、focused compatibility proof。

本阶段不包括：

- 不建立 canonical extension registry/namespace tables。
- 不改变 filesystem/Git discovery authority 或 `extension_settings` owner。
- 不删除 protected browser APIs、mount points、events、slash 或 regex surfaces。

## 边界规则 / 验收

R1: Global 与 user scope 必须明确区分；per-user operation 不得改写 server-wide worktree。

R2: Dirty worktree 不得被 update/switch/move/delete 自动 reset、clean 或覆盖。

R3: Detached/no-upstream/missing worktree/invalid manifest/scope collision 必须在 mutation 前
阻断并返回稳定 reason code。

R4: Install 必须验证 URL、destination containment、manifest 和 collision 后再发布目录。

R5: Operation failure 必须区分 retryable、user_action_required、forbidden 和 invalid_request，
同时保持旧成功 response shape。

R6: `extension_settings` 继续由 canonical settings document 保存；目录 discovery 继续是
runtime registry authority。

R7: Protected mount points、`@sillytavern/*`、`/lib.js`、events、slash、regex 和
JS-Slash-Runner compatibility gates 必须保持。

R8: 若未来需要 server-wide database registry，必须另立 ADR，本包不得预埋双权威。

## 架构 / 约束

- `src/endpoints/extensions.js` 保持 route/auth/permission owner。
- Git 状态判断集中在纯 helper/service，避免每条 route 分叉。
- 使用现有 path/sanitization/SSRF contracts，不增加依赖。

## 数据 / 集成

不新增 canonical table。可引入 operation decision/result objects 和临时 staging marker；
失败信息不得包含凭据或不必要的本地路径。

## 验证

```bash
bun run --cwd tests test:unit -- extension-repo-update-state.test.js extension-operation-safety.test.js workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run docs:check
```

## Doc ID 契约

- `feature.extension_panel_open`：更新 install/update/switch/move/delete 的错误与恢复语义。
- `term.shared_browser_library`：确认 `/lib.js` 与 `@sillytavern/*` 兼容边界未改变。

## 参考资料

- `.docs/db/features/extension-panel-open.md`
- `.docs/db/terms/shared-browser-library.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `src/endpoints/extensions.js`

