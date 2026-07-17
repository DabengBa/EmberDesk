# React Background Library Legacy 退休

## 意图与核心流程

让 React Background Library 从 catalog 加载到持久化结果全程独立：用户浏览 global/chat backgrounds，过滤/排序/进入 folder，选择或锁定，上传/重命名/删除/刷新，并通过 slash commands 获得同样结果。

## 范围 / 不做范围

包括 background services、React query/actions/state、folders、selection/lock、upload/rename/delete、thumbnail、slash adapters、legacy DOM/controller/flag/fallback 删除。

不改变 background API、file/managed media authority、settings document、URL format、slash names 或 workspace shell。

## 边界规则 / 验收

R1: React 必须独立加载 global 与 chat background catalogs，保持 folder membership、gallery order、filter、sort、active tab、empty/loading/error/retry 和 refresh。

R2: selection、chat lock/unlock、auto selection、group selection mode、copy-to-system、rename、delete replacement 和 current background highlighting 必须通过 service/state 完成，不依赖 legacy gallery DOM。

R3: global/chat upload 必须保持 filename/path guards、duplicate/rename feedback、settings persistence、managed media projection、thumbnail pregeneration/lazy loading 和 post-upload selection。

R4: `/lockbg`、`/unlockbg`、`/autobg` 与相关 slash callback 必须调用同一 background service；命令返回、events、metadata 和可见结果与 UI action 一致。

R5: 删除、rename、refresh 或 late catalog response 后，当前 selection/lock/URL 不得指向不存在项；失败保留可恢复 gallery 状态并不得假成功。

R6: `public/scripts/backgrounds.js` 若需保留 public imports/command registration，只能作为薄 service/command barrel；不得拥有 gallery DOM、jQuery event binding 或 React bridge state。

R7: legacy background panel HTML/gallery、`background-panel-controller.js`、hidden adapter、panel flag、mount/build fallback 和 legacy-only handlers/styles 必须删除；相同 workspace entry 保留。

R8: unit/E2E 必须覆盖 global/chat、folders、selection、lock、upload、rename、delete、thumbnail、slash、reload persistence、mobile；semantic docs 更新并通过 docs check。

## 架构 / 约束

- 抽出 framework-neutral catalog/action service；React 使用 TanStack Query/Mutation/Form。
- slash command adapter 与 React UI 共用同一 service，避免两套行为。
- 保持现有 path/filename guards 和 settings save API。
- 不新增 dependency 或第二 catalog cache。
- React gallery 自己拥有 item identity 与 focus，不托管 legacy element。

## 数据 / 集成

- 背景文件、folders、thumbnail URLs、chat metadata 和 settings background shape 保持。
- managed media enabled/disabled/repair 行为保持。
- operation result 必须包含足够 identity 供 query reconcile，但不改变外部 endpoint success shape。

## 验证

```bash
bun run --cwd tests test:unit -- background-panel-controller.test.js thumbnail-lazy-image-loading.test.js thumbnail-cache-headers.test.js thumbnail-write-time-pregeneration.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- background-action-persistence.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1
bun run docs:check
```

## Doc ID 契约

- `feature.background_library_panel`：完整 catalog/action/slash/sole-owner behavior。
- `page.chat_workspace`：same-entry drawer 与背景对 chat canvas 的结果。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `public/scripts/backgrounds.js`
- `public/scripts/background-panel-controller.js`
- `app/workspace-panels.tsx`
- `tests/background-action-persistence.e2e.js`
- `.docs/db/features/background-library-panel.md`
