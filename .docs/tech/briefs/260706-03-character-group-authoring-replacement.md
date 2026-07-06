---
created: 2026-07-06
source: user-request
confirmed: true
last_updated: 2026-07-06
---

# Character And Group Authoring Replacement

## User Original Request

用户要求继续推进 Workspace React replacement roadmap，在 `260706-02-legacy-panel-control-cutover` 已把 Group Chats 和 Character Authoring 纳入 shell/dock 控制后，继续把角色创建/编辑与群组创建/编辑这些高风险 legacy authoring surfaces 迁移到 React owner。

## Background & Motivation

当前 React shell 已经能从同一入口打开、关闭、再打开 Character Authoring 和 Group Chats，但这两个入口内的可见编辑表单仍由 legacy DOM 和 jQuery owner 管理。用户看到的是新 shell 打开旧编辑器，保存、取消、字段错误、dirty state 和跨面板切换行为仍然分散在 legacy 表单、副作用和隐藏字段中。

本切片的动机是把“用户正在编辑什么、是否有未保存内容、保存是否成功、哪里出错”迁移到 React authoring owner，同时保留 EmberDesk 的文件格式、现有后端 endpoint、角色列表 DOM identity、群组存储格式和扩展兼容边界。

## Intent Domains

### Domain 1: character authoring becomes React-owned

- **User expectation:** 从 Character Library 或 shell 进入创建/编辑角色时，用户看到统一、紧凑、字段状态清楚的 React authoring surface。
- **Current status:** delivered on 2026-07-06.
- **Delivery status:** React now owns the visible character authoring draft, field validation, dirty/save state, duplicate/export/world-info entry points, and the authoring shell inside the existing right drawer while legacy write-through/save/delete behavior remains the storage authority.
- **Implementation traceability:** `public/scripts/character-authoring.js`, `public/script.js`, `app/workspace-panels.tsx`, `tests/character-authoring-facade.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/character-group-authoring.e2e.js`; durable behavior archived in `.docs/db/features/character-library-panel.md`, `.docs/db/terms/character-card.md`, and `.docs/db/pages/chat-workspace.md`.
- **Clarified UX contract:** 默认先展示 identity、description、first message；高级 prompt/persona、alternate greetings、World Info 关联等作为折叠但一键可达的次级分区。顶部身份行是唯一主状态来源，避免同一保存状态被多处重复表达。

### Domain 2: group authoring becomes React-owned

- **User expectation:** 从 Group Chats 创建/编辑群组时，用户能清楚管理群组名称、头像、策略、成员、排序、标签和保存/删除状态。
- **Current status:** delivered on 2026-07-06.
- **Delivery status:** React now owns the visible group authoring shell, member add/remove/reorder controls, non-drag keyboard/button reorder path, and save/cancel/delete presentation while the existing group file shape and edit/create flows remain the canonical write path.
- **Implementation traceability:** `public/scripts/group-authoring.js`, `public/scripts/group-chats.js`, `public/script.js`, `app/workspace-panels.tsx`, `tests/group-authoring-facade.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/character-group-authoring.e2e.js`; durable behavior archived in `.docs/db/features/group-authoring.md` and `.docs/db/pages/chat-workspace.md`.
- **Clarified UX contract:** 默认先展示 identity 与 members；成员行要同时支持按钮/键盘式上移下移，拖拽只是附加能力。Delete/Remove 必须与 Save/Cancel 分区显示，不能只靠颜色弱区分。

### Domain 3: compatibility and data authority stay unchanged

- **User expectation:** 新编辑器不能破坏角色卡文件、群组文件、导入/导出、角色列表、当前聊天上下文或第三方扩展。
- **Current status:** delivered on 2026-07-06.
- **Delivery status:** save/delete/export/reopen behavior stays on the existing public seams, legacy selection events remount the React owner after popup/edit flows, and compatibility/build/docs gates stayed green after the cutover.
- **Implementation traceability:** `public/script.js`, `src/workspace-react-features.js`, `tests/character-list-structure.test.js`, `tests/character-list-state.test.js`, `tests/character-list-render-state.test.js`, `tests/workspace-shell-panel-navigation.e2e.js`, `tests/character-group-authoring.e2e.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/workspace-react-panel-flags.test.js`; durable behavior archived in `.docs/db/features/next-workspace-shell.md`, `.docs/tech/workspace-shell-panel-dock-coordination.md`, `.docs/project-overview.md`, and `.docs/PROJECT_HISTORY.md`.
- **Clarified UX contract:** legacy authoring DOM 如需保留，只能作为 rollback/compat host；React 与 legacy 之间切换不得造成双重可编辑 owner、布局跳动或双滚动容器。

## Implementation Traceability

- Delivery status: delivered on 2026-07-06 and ready for spec archival.
- Code path: `public/scripts/character-authoring.js`, `public/scripts/group-authoring.js`, `public/scripts/group-chats.js`, `public/script.js`, `app/workspace-panels.tsx`, `src/workspace-react-features.js`.
- Proof path: `tests/character-authoring-facade.test.js`, `tests/group-authoring-facade.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/character-group-authoring.e2e.js`, `tests/workspace-shell-panel-navigation.e2e.js`, `tests/character-list-structure.test.js`, `tests/character-list-state.test.js`, `tests/character-list-render-state.test.js`, `bun run test:compat`, `bun run build:react:workspace-panels`, `bun run docs:check`.
- Change history:
  - 2026-07-06: Created the brief from the approved authoring replacement intent so the React owner migration could be delivered without losing the user’s compatibility and UX constraints.
  - 2026-07-06: Delivered the React-owned character/group authoring shell, legacy write-through bridges, remount recovery after legacy popup flows, semantic doc updates, and browser/compatibility proof; final review closed with no confirmed findings.

## Confirmed Design Defaults

- authoring 视觉语言必须复用 EmberDesk 现有 warm, dense, atmospheric 工作台词汇，不引入 SaaS 卡片堆叠、渐变 CTA、说明型空状态或装饰动效。
- 角色/群组 authoring 必须共享同一套 panel shell、状态表达与动作层级，只在字段内容和 domain 行为上分化。
- action rail 桌面端固定在右侧，窄宽度收为底部 sticky bar；`Save` 是唯一主动作，`Cancel` 是次动作，`Duplicate/Export` 是次级工具动作，`Delete/Remove` 单独置于危险区。
- authoring 的 helper copy 从严控制：优先依赖字段名、分组和状态引导，错误贴近字段或字段组，不追加长说明文字。

## Source Evidence

- `.docs/tech/briefs/260706-01-workspace-react-replacement-roadmap.md`
- `.docs/tech/briefs/260706-02-legacy-panel-control-cutover.md`
- `.docs/db/features/character-library-panel.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/terms/character-card.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/index.html`
- `public/script.js`
- `public/scripts/group-chats.js`
- `app/workspace-panels.tsx`
- `tests/character-list-structure.test.js`
- `tests/workspace-shell-panel-navigation.e2e.js`

## Non-Goals

- 不改变角色卡文件格式、群组存储格式、导入 pipeline、后端数据 source of truth 或删除级联规则。
- 不删除 legacy form DOM，除非后续 cutover spec 明确允许。
- 不把角色列表 row DOM 或 protected extension selectors 改成 React owner。
- 不新增全局 onboarding、长说明文案、装饰动效或持久 workspace preference。
- 不把角色/群组 authoring 做成两套不同的视觉系统，或为了“现代化”引入不符合 EmberDesk 密度语言的卡片式信息架构。
