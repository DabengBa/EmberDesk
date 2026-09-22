# U-10 Dossier：Extensions host（扩展宿主）

> U-loop 面：`U-10 | Extensions host | 关联 | React+legacy 容器 | *_container 空槽清理并入此轮`
> U0 盘点 + U2 实施日期：2026-09-22

## U0 面盘点

### 现状定性：**已迁移**（React workspace panel + 兼容槽生命周期）

- `ExtensionsHostWorkspacePanel`（`workspace-panels.tsx`）：TanStack Form + Zod + `ExtensionsHostCommands` 命令口 + `WorkspacePanelShell` 状态机（empty/error/recovery 动作）。覆盖 notify-updates、Manage/Install、Extras API URL/Key、auto-connect/connect 全部控件。
- `ensureExtensionsHostReactHost` 把 React host 插在 `#rm_extensions_block > .extensions_block` 之前——React 面板是可见面，legacy 双列保留为兼容槽宿主。
- `extension-compatibility-slots.js`：5 个稳定槽（`extensions_settings`/`extensions_settings2`/`regex_container`/`extensionsMenuButton`/`extensionsMenu`），React 认领 `data-extensions-host-slot-owner`，unmount 不毁扩展注入内容；实测三槽 owner=`react-extensions-host`、内容在位。

### 唯一残余：`*_container` 死槽（清单既定清理项）

`index.html` 双列下 26 个 `.extension_container`，对应内置扩展已在退役批中移除（`public/scripts/extensions/` 仅剩 connection-manager/quick-reply/regex/token-counter/third-party）。实测 25 个空槽零子内容、零 JS/CSS/测试引用；唯 `regex_container` 存活（`extensions/regex/index.js` 注入设置面板，compat 测试钉点）。

风险核查：第三方扩展注入的是列级 `#extensions_settings`/`#extensions_settings2`，不点名内置容器；上古脚本若点名死槽 ID，jQuery `.append` 为空选择器静默 no-op，不崩。

## U1 设计提案（用户批准：做）

删除 25 个死 `.extension_container` 空 div，`regex_container` 保留（活槽 + compat 钉点）。

## U2 实施

`public/index.html`：25 行死槽删除；`#extensions_settings` 留空列宿主（动态注入点），`#extensions_settings2` 保留 `regex_container`。

## U3 实测（:8000 无头）

- 仅剩 `regex_container:1`（regex 扩展设置正常渲染），slot owner 不变
- 双列宿主在位（各 1 个活子节点），React host 在位
- 零 JS 报错

## U4 门禁

| 门 | 结果 |
|---|---|
| test:compat | 111/111 ✓ |
| focused（third-party-extension-compat / extension-host-service / deferred-panel-replays） | 19/19 ✓ |

## U5 台账

- 实施提交：（本批次，单 commit 含 index.html + 档案）
- 用户验收：U0 提案批准"做"
