# Supporting Panel Content Replacement

## 意图与核心流程

本规格把已存在的 World Info、Backgrounds、Extensions React action-host islands 深化为真实内容 owner，逐步减少对 legacy DOM click/facade 的依赖。

主路径是：用户打开 World Info、Backgrounds 或 Extensions；React panel 直接渲染主要列表、筛选、编辑和动作结果；legacy owner 只保留为兼容 fallback 或受保护扩展挂载点。

## 范围 / 不做范围

本次做：

- World Info：React owner 接管 world selector、entry list、search/sort、entry create/edit form、import/export/refresh 的主要可见 surface；legacy regex/prompt scan/converter 语义保留为后台 service/facade。
- Backgrounds：React owner 接管 background gallery、filter/sort、upload/select/lock/unlock/auto/refresh 可见 surface；legacy file API 和 thumbnail route 保留。
- Extensions：React owner 接管 extension host chrome、installed extension list/status、manage/install/update controls、Extras API connection controls；protected extension content mount points 保留在 documented legacy slots。
- 每个 panel 都要定义 fallback boundary：flag off、missing bundle、action failure、extension unsafe state。

本次不做：

- 不删除 `#extensions_settings`、`#extensions_settings2`、`#regex_container`、`#extensionsMenuButton`、`#extensionsMenu`。
- 不重写 third-party extension runtime、regex engine、slash command parser。
- 不改变 background file storage 或 world info storage schema。
- 不改变 prompt injection semantics。

## 边界规则 / 验收

- World Info React list 中创建、编辑、保存、删除 entry 后，legacy prompt scan 和刷新后数据必须一致。
- Backgrounds React gallery 中上传、选择、lock/unlock、auto 后，当前背景、chat背景和刷新后状态必须一致。
- Extensions React host 中 manage/install/update/connect 操作后，protected mount points 必须仍存在，JS-Slash-Runner 兼容测试必须通过。
- 每个 panel 的 loading/empty/success/error 状态必须局部显示，不得阻塞 chat workspace。
- 如果 React content owner 不能安全接管某个子区域，必须显式标记为 compatibility slot，不得复制 DOM 后让两个 owner 同时写同一区域。

## 架构 / 约束

- 本规格依赖 `260706-01` 完成。
- React content owner 可使用 TanStack Query / TanStack Form / Zod，但不得新增 dependency。
- `public/scripts/world-info.js`、`public/scripts/backgrounds.js`、`public/scripts/extensions.js` 可以被收敛成 service/facade，但 public compatibility exports 不能无证据删除。
- Extensions 的任何可见迁移必须通过 `bun run test:compat`，并继承 JS-Slash-Runner hard gate。
- 旧 DOM slots 可以保留为 `LegacySlotHost`，但必须有明确 owner 注释和测试。

## 数据 / 集成

- World Info 使用现有 world info data 和 endpoints。
- Backgrounds 使用现有 backgrounds endpoints、thumbnail route 和 settings。
- Extensions 使用现有 extension discovery、manifest、install/update/delete 和 Extras API state。
- 不新增持久 schema。
- 如果新增 facade API，必须同时提供 unit tests 和 fallback behavior。

## 验证

- `bun run --cwd tests test:unit -- world-info-card-rendering.test.js react-workspace-panels-helpers.test.js --runInBand`
- `bun run test:compat`
- World Info E2E：create/edit/save/delete/import/export/refresh。
- Backgrounds E2E：upload/select/lock/unlock/auto/refresh。
- Extensions E2E 或 compatibility proof：protected mount points、manage/install/update/connect、JS-Slash-Runner gate。
- `bun run build:react:workspace-panels`

## Doc ID 契约

- `feature.world_info_panel`：更新 React content owner 与 compatibility slot。
- `feature.background_library_panel`：更新 React gallery/action owner。
- `feature.extension_panel_open`：更新 React host owner 与 protected mount slots。
- `page.chat_workspace`：更新 supporting-panel migration state。

## 参考资料

- `.docs/db/features/world-info-panel.md`
- `.docs/db/features/background-library-panel.md`
- `.docs/db/features/extension-panel-open.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/world-info-shell-context.md`
- `public/scripts/world-info.js`
- `public/scripts/backgrounds.js`
- `public/scripts/extensions.js`
- `app/workspace-panels.tsx`
- Inference: 当前 action-host island 已证明 shell/action routing 可行，但真实替换必须把主要 list/form/gallery owner 迁到 React。
