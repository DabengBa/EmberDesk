# React Character Library Legacy 退休

## 意图与核心流程

让 React Character Library 成为同入口角色/群组浏览与批量管理的唯一 owner。用户仍可搜索、按 tag 过滤、排序、切换分页/大列表、选择角色或群组、批量操作和删除；兼容 selectors 由 React DOM 直接提供。

## 范围 / 不做范围

包括 React-owned list/query/state/actions、row compatibility、tag/bulk/dialog、active selection、delete reconcile、feature flag/legacy host/renderer/sync 删除。

不包括 character/group authoring form、group chat runtime、API/schema/storage 重写或 UI redesign。

## 边界规则 / 验收

R1: React 必须独立获取和呈现 character、group、folder rows，保留 search、sort、tag filter、favorite、pagination、lazy/oversized guidance 与 virtualized large-list 行为。

R2: React 生成的 row 必须保留 `.character_select`、`.group_select`、`.bogus_folder_select`、`data-chid`、legacy `chid`、`id="CharID${chid}"`、`.character_selected`、`.bulk_select_checkbox`、`.tags_inline`、`.ch_fav` 及其现有可观察语义。

R3: 单选、键盘导航、active row、bulk select、select-all、selected count、bulk tag/delete 和确认 dialog 必须由 React state/action owner 完成；不得通过 hidden legacy toolbar 或 jQuery delegated handler执行。

R4: 删除、导入或晚到 query snapshot 后，已删除/替换 card 不得重新出现；当前页、selection 和 active character 必须进入现有安全状态。

R5: 从 welcome screen、workspace shell、chat tests 和 extension-adjacent scripts 打开/选择角色或群组时，入口、结果、events 和 row identity 必须保持。

R6: `features.react.panels.characterLibrary`、`src/react-character-library-feature.js`、`LegacyElementHost`、legacy list renderer/toolbar、`character-library-react-sync.js` 和 build/flag fallback 必须删除；React bundle 缺失由 build/release gate 阻止。

R7: 大列表 interaction evidence 不得显著劣化；现有 character library runner 与 E2E 必须覆盖初次可见、搜索、selection 和 bulk。

R8: semantic docs 必须更新 sole-owner 和 compatibility DOM 来源；`bun run docs:check` 通过。

## 架构 / 约束

- 复用现有 TanStack Query/Form、Zustand（仅在已有 store 合适时）和 TanStack Virtual。
- React row component 是兼容 DOM 唯一生产者；不得保留不可见重复 rows。
- 复用现有 character read/delete/import services 与 event contracts，不复制 backend authority。
- Shell 只负责打开 panel；Character Library 自己拥有内部状态。
- 不新增依赖或第二个 cache。

## 数据 / 集成

- `/api/characters/all|list|get` 及 group routes payload 保持。
- file-backed/canonical storage、delete cascade、thumbnail 与 derived cache 边界不变。
- React query invalidation/reconcile 必须处理 mutation generation，避免 late snapshot 复活数据。

## 验证

```bash
bun run --cwd tests test:unit -- character-library-react-helpers.test.js character-list-state.test.js character-list-render-state.test.js character-list-structure.test.js character-read-service.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run build:react:character-library
bun run --cwd tests test:e2e -- welcome-screen-character-management.e2e.js character-group-authoring.e2e.js --workers=1
bun run perf:interaction
bun run docs:check
```

## Doc ID 契约

- `feature.character_library_panel`：列表、filters、tags、bulk、selection、compat rows 与 sole owner。
- `page.chat_workspace`：same-entry open/select 和 active context。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `app/components/character-library/CharacterLibraryPanel.tsx`
- `app/components/character-library/LegacyElementHost.tsx`
- `public/script.js`
- `public/scripts/character-library-react-sync.js`
- `tests/character-list-structure.test.js`
- `tests/third-party-extension-compatibility.test.js`
