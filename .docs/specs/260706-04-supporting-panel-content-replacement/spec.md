# Retire Authoring Replacement With Full Honors

## 意图与核心流程

本规格收口 `260706-03-character-group-authoring-replacement` 之后的 authoring replacement 尾项：把已经迁入 React 的 Character Authoring 与 Group Authoring 体验从“可用替换”提升为默认可交付状态，并给 legacy authoring host 一个明确、体面的退场边界。

主路径是：用户打开角色创建/编辑或群组创建/编辑；React authoring panel 是唯一可见编辑 owner；legacy form 仅作为 rollback / compatibility host 和存储写入桥；用户不会同时看到两个可编辑 authoring surface。

本规格原名为 Supporting Panel Content Replacement，但本轮实际变更聚焦 authoring replacement honor pass。World Info、Backgrounds、Extensions 的真实内容 owner 深化仍保留在后续 supporting-panel cutover 中，不能和本轮 authoring 收口混作一个交付边界。

## 范围 / 不做范围

本次做：

- Character Authoring：保存后等待 legacy 成功事件再复位 React dirty state，避免“UI 已 ready 但 legacy 仍在保存”的错觉。
- Character / Group Authoring：create mode 不显示 Delete；edit mode 才显示独立 danger zone。
- Group Authoring：React 挂载成功时隐藏 legacy group form 兄弟节点，flag off / bundle 缺失 / mount 失败时恢复 legacy form。
- Group Authoring：Cancel 不再把 Group Chats 入口重开成另一个 owner，而是保留本地安全取消语义并避免 remount loop。
- Authoring action hierarchy：Save 是唯一主动作；Cancel 是次动作；character tools 是低权重工具动作；Delete 只在 edit mode 的危险区显示。
- Authoring narrow layout：成员行在窄屏变为单列，动作区 sticky，保证 Save/Cancel/成员排序按钮仍可触达。
- Accessibility：成员 Remove / Move up / Move down 保留可见文案，同时用成员名扩展 accessible name，避免重复按钮对辅助技术不可区分。
- Semantic docs：更新 `feature.group_authoring` 的真实 owner 与兼容边界。

本次不做：

- 不删除 legacy character/group authoring DOM。
- 不迁移 avatar、tags、generation strategy、group toggles 等尚未具备 React dedicated controls 的字段。
- 不改变角色卡文件格式、群组存储格式、legacy save/delete/export API 或后端 endpoint。
- 不推进 World Info、Backgrounds、Extensions 主要内容 owner；这些仍属后续 supporting-panel replacement。

## 边界规则 / 验收

- Create mode 中 Character Authoring 和 Group Authoring 都不得显示 Delete。
- Edit mode 中 Delete 必须与 Save/Cancel 分区显示，不能出现在主保存行。
- React group authoring 挂载成功后，legacy group form 不能同时可见或可编辑；React disabled/fallback 时 legacy form 必须恢复。
- Character authoring save 必须等 legacy 成功事件后才清理 React dirty state；失败时 draft 必须保留并提供 retry。
- Group member reorder 必须有非拖拽路径，按钮名要能区分具体成员。
- 窄屏抽屉中 Save/Cancel 与成员操作不能被挤出可达区域。

## 架构 / 约束

- 本规格依赖 `260706-03` 的 Character / Group Authoring React owner 基线。
- `public/script.js` 仍是 legacy authoring write-through 与 drawer integration owner。
- `app/workspace-panels.tsx` 只能拥有可见 React authoring state、field validation、action hierarchy 和 local mutation state。
- 不能新增 dependency。
- legacy DOM 可以保留，但 visible owner 必须单一，且 fallback 必须失败闭合。

## 数据 / 集成

- Character authoring 使用现有 character save/edit/export/delete path。
- Group authoring 使用现有 group create/edit/delete path 和 member draft bridge。
- 不新增持久 schema。
- 不新增 workspace preference。
- 只新增或收紧 React-to-legacy bridge behavior、CSS states、tests 和 docs。

## Grill 自问自答 / 联网校验

- 问：Delete 是否应该和 Save/Cancel 同一动作行？答：不应该。NN/g 对 consequential options 的研究建议把确认性动作与破坏性动作拉开距离，并使用冗余视觉信号降低误触风险；这支持独立 danger zone。Reference: https://www.nngroup.com/articles/proximity-consequential-options/
- 问：Create mode 是否应该显示 Delete 作为 disabled/备用动作？答：不应该。创建中没有已存在对象可删，显示 Delete 只会增加认知噪音；本轮改为仅 edit mode 呈现。
- 问：短按钮文案是否足够区分多个 member row 的 Move up / Move down？答：视觉上保留短文案以维持密度，但 accessible name 必须包含成员名。W3C APG/WCAG techniques 允许 `aria-label` 为按钮提供明确 accessible name；本轮用成员名消除重复按钮歧义。References: https://www.w3.org/WAI/ARIA/apg/patterns/button/ and https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA14
- 问：保存按钮是否可以在 legacy save 未完成前显示 Ready？答：不可以。用户信任的是可见保存状态而不是 bridge 调用返回；本轮 Character Authoring 等待 legacy success event 后再重置 session。
- 问：隐藏 legacy group form 是否太激进？答：不激进。React 与 legacy 同时可编辑同一数据才是高风险；隐藏只发生在 React mount 成功后，fallback 路径恢复 legacy form，符合单 owner 规则。

## 验证

- `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js --runInBand`
- `bun run build:react:workspace-panels`
- `bun run --cwd tests test:e2e -- character-group-authoring.e2e.js`
- UX walkthrough：fresh context 下打开 Character Authoring 与 Group Chats，视觉检查 create mode、action hierarchy、窄屏可达性和 fallback/legacy-owner 不重叠。
- UX walkthrough 结论：Group Authoring create mode 的候选成员列表曾把 Save/Cancel 推出首屏；本轮已改为受限高度紧凑网格，并通过桌面与移动截图确认主动作可见。
- `bun run docs:check`
- `bun run build:react:workspace-panels`

## Doc ID 契约

- `feature.group_authoring`：更新 React visible owner、legacy compatibility host、action hierarchy、create/edit Delete 规则。
- `feature.character_library_panel`：如本轮代码行为改变角色 authoring 用户契约，再更新 character authoring owner/bridge 边界。
- `page.chat_workspace`：如 authoring owner 状态描述过期，再更新 workspace authoring state。

## 参考资料

- `.docs/tech/briefs/260706-03-character-group-authoring-replacement.md`
- `.docs/db/features/group-authoring.md`
- `.docs/db/features/character-library-panel.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `app/workspace-panels.tsx`
- `public/script.js`
- `public/style.css`
- Inference: 当前 React authoring owner 已经可替代 legacy visible form，本轮 honor pass 必须消除双 owner、错误状态过早成功、危险动作混排和窄屏可达性问题。
