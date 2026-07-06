# Character And Group Authoring Replacement

## 意图与核心流程

本规格把角色创建/编辑和群组创建/编辑从 legacy form owner 迁移为 React owner，同时保留角色卡、群组成员、标签、World Info 关联和扩展兼容。

主路径是：用户从 Character Library 或 Group Chats 进入创建/编辑，React authoring panel 显示字段、校验、保存、复制、删除、导入/导出相关入口；保存后现有文件写入、角色列表刷新和当前聊天上下文保持一致。

## 范围 / 不做范围

本次做：

- React owner 接管角色创建、角色编辑、角色详情字段、头像预览、tags、creator notes、system prompt、post-history instructions、alternate greetings 入口、character world 关联入口的可见 form surface。
- React owner 接管群组创建/编辑、成员列表、成员排序、群组头像/名称/描述等 authoring surface。
- 使用 TanStack Form + Zod 管理表单和校验；保存仍调用现有 character/group service 或 facade。
- 保留 legacy DOM selector 兼容，特别是 `.character_select`、`data-chid`、legacy `chid`、`id="CharID${chid}"`、`.group_select`、`.tags_inline`、`.ch_fav`。
- 对保存、取消、删除、切换角色、切换群组、刷新后重进 authoring surface 建立 E2E。

本次不做：

- 不改变角色卡文件格式。
- 不改变群组存储格式。
- 不迁移角色导入 pipeline 或统一导入确认逻辑。
- 不删除 legacy form DOM，除非 cutover spec 允许。

## 边界规则 / 验收

- 打开现有角色后，React form 显示的字段值必须与当前角色数据一致。
- 修改并保存后，刷新页面、重新打开角色、角色列表和 active chat context 必须反映保存结果。
- 取消或关闭 authoring panel 不得写入未保存字段。
- 删除角色或群组必须继续使用现有确认/cascade/safe-close 规则。
- 标签、favorites、World Info 按钮状态、connected personas、alternate greetings 入口必须继续可达。
- 任何 extension-mutated 或不安全字段必须 fallback 到 legacy owner 或显示明确 unsupported 状态，不得静默丢字段。

## 架构 / 约束

- 本规格依赖 `260706-01` 和 `260706-02` 完成，确保 Character/Group authoring 已经是 registry panel。
- React form 可以作为 island 挂入现有 drawer，但提交/删除/导入/导出应复用已有 public helpers 或后续提取出的 pure facade。
- 文件写入仍由现有 backend endpoints 和 file-backed storage owner 执行。
- 不得破坏 Character Library list owner，也不得把 list row DOM 改成新结构。
- 不得破坏 Tavern Helper / JS-Slash-Runner 可能依赖的角色编辑入口和 avatar filename 语义。

## 数据 / 集成

- 输入：当前 `characters`、`groups`、tags、world names、persona state。
- 输出：现有角色卡文件、群组文件、settings debounce、当前 chat context 更新。
- 不新增数据库表。
- 若需要新增 facade，应放在 `public/scripts/*` 里作为可测纯边界，不直接从 React 组件写 legacy globals。

## 验证

- `bun run --cwd tests test:unit -- character-list-structure.test.js react-workspace-panels-helpers.test.js --runInBand`
- 新增 authoring unit tests：field projection、dirty state、save payload、cancel behavior。
- 新增 Playwright E2E：创建角色、编辑角色、取消编辑、删除确认、创建群组、编辑群组成员、刷新后复查。
- `bun run test:compat`
- 若 docs 更新：`bun run docs:check`

## Doc ID 契约

- `feature.character_library_panel`：补充进入 authoring 的 React owner 状态。
- `term.character_card`：如字段语义或保存流程说明改变，需要更新。
- `page.chat_workspace`：补充 Character/Group authoring owner state。
- 若新增 Group feature Doc ID，应创建 `.docs/db/features/group-authoring.md`，建议 ID `feature.group_authoring`。

## 参考资料

- `.docs/db/features/character-library-panel.md`
- `.docs/db/terms/character-card.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/script.js`
- `public/scripts/group-chats.js`
- `public/scripts/character-list-state.js`
- `public/scripts/character-list-render-state.js`
- `tests/character-list-structure.test.js`
- Inference: authoring 是高风险写入面，必须单独规格化，不能混入普通 drawer control cutover。
