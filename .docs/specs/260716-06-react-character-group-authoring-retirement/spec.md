# React Character 与 Group Authoring Legacy 退休

## 意图与核心流程

让 React authoring surfaces 从 draft 到持久化结果全程独立。用户从当前 workspace 入口新建或编辑角色/群组，修改全部受支持字段，保存后库和当前上下文立即同步；取消不写入，删除进入安全状态。

## 范围 / 不做范围

包括 character/group 字段 coverage、React form/state、avatar/media、member order、save/delete command、conflict/error/reconcile、legacy forms/facades/flags 删除。

不包括 Character Library list owner、group chat generation、character/group schema 变更、storage authority 迁移或交互 redesign。

## 边界规则 / 验收

R1: Character React form 必须覆盖 legacy form 中所有用户可访问且仍受支持的 create/edit 字段，包括 name、description、first message、alternate greetings、scenario、personality、system/post-history prompts、creator metadata、tags、avatar/media、World Info relation 和高级 card fields；不得保留“unsupported fields 在 legacy 编辑”的出口。

R2: Group React form 必须覆盖 name、avatar、members、member order、activation/generation strategy、favorite/tags 及当前 group editor 的全部用户可访问选项；member reorder 不得只依赖 drag。

R3: Character save 必须调用明确的 character write command/service；Group save 必须调用明确 group command/endpoint。不得触发 hidden form、legacy button、`waitFor*SaveCompletion()` 或依赖 DOM mutation 判断成功。

R4: create/edit/save/delete/cancel 必须保持现有 validation、duplicate name、file conflict、delete confirmation、cascade warning、busy/error 和 post-save selection 结果；失败不得清空 draft或显示假成功。

R5: 保存结果必须以 response identity/revision 或等价 mutation token reconcile Character Library、当前 character/group、chat title 与 authoring draft；晚到 response 不得覆盖更新 draft或复活删除实体。

R6: legacy character/group forms、hidden host、authoring facade、panel flags、mount/build fallback 与相关 jQuery handlers 必须删除；相同 workspace entry 与 drawer open/close 语义保留。

R7: character card import/export、group file format、API payload、file-backed/canonical projection 与 extension-visible card identity 不变。

R8: browser proof 必须覆盖 create/edit/delete/cancel、avatar、advanced fields、member reorder、reload persistence、mobile reachability；semantic docs 与 `bun run docs:check` 通过。

## 架构 / 约束

- React form 使用现有 TanStack Form + Zod；server state/mutations 使用 TanStack Query。
- 业务 write command 复用 `src/endpoints/character-write-service.js` 和 groups endpoint，不在组件内复制文件逻辑。
- 公共 card/group payload 可以增加内部 command adapter，但外部 API shape 不能随意改变。
- Character Library invalidation 使用已存在 query key/refresh path，不引入第二 store。
- 删除 feature flags 后，workspace panel bundle 是必需构建产物。

## 数据 / 集成

- Character 写入继续经过现有 path/filename/avatar guards、card parser 和 canonical projection。
- Group 写入继续使用现有 file-backed group representation 与 member identifiers。
- Draft 只存在于 React state；取消/关闭不持久化。
- Secrets、chat messages 与 unrelated settings 不进入 authoring payload。

## 验证

```bash
bun run --cwd tests test:unit -- character-authoring-facade.test.js group-authoring-facade.test.js character-write-service.test.js character-card-helpers.test.js react-workspace-panels-helpers.test.js --runInBand
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- character-group-authoring.e2e.js welcome-screen-character-management.e2e.js --workers=1
bun run test:compat
bun run docs:check
```

## Doc ID 契约

- `feature.group_authoring`：完整 group form、member management、save/cancel/delete 与 sole owner。
- `feature.character_library_panel`：character authoring 入口与保存后的 library reconcile。
- `page.chat_workspace`：same-entry drawer、当前上下文与 post-delete 安全状态。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `public/scripts/character-authoring.js`
- `public/scripts/group-authoring.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/groups.js`
- `.docs/db/features/group-authoring.md`
- `.docs/db/features/character-library-panel.md`
- Inference：先建立字段 coverage inventory 再删 legacy form，是防止 hidden fields 静默丢失的最小验收方式。
