# U-11 Dossier：弹层族（Popup family）

> U-loop 面：`U-11 | 弹层族 CharacterPopup/ContextMenu/TagManagement/ExportFormat/ChatBackups/MacroBrowser/DialoguePopups | 混合 | React | 统一 popup 骨架组件先行`
> U0 盘点日期：2026-09-22

## U0 面盘点

### 现状定性：**已迁移**（清单所列 7 弹层全部 React 内容拥有）

| 弹层 | 现状 | 证据 |
|---|---|---|
| CharacterPopup | `#character_popup` 空宿主 → `mountCharacterPopup` 全 React 内容 | script.js:10296 |
| ContextMenu | `CharacterContextMenu.tsx` React 项，`.hidden`+定位壳 legacy（契约） | U-8 已验收 |
| TagManagement | `mountTagManagement` 挂载进 tags.js 动态弹层宿主 | tags.js:1706-1709 |
| ExportFormatPopup | `#export_format_popup` 空 `.list-group` 宿主 → React 内容 | script.js:10485 |
| ChatBackupsBrowser | `mountChatBackupsBrowser` | chat-backups.js:65 |
| MacroBrowser | `mountMacroBrowser` | macros/engine/MacroBrowser.js |
| DialoguePopups | `#dialogue_popup_controls`/`del-mes` 控件 React（实测 astryx 钮在位） | mountDialoguePopupControls |

### 保留的契约壳（非视觉残余，不动）

- **`#popup_template`/`Popup` 类**：共享弹层骨架（confirm/yesNo/input/crop），~165 个调用点 + 扩展可直接 `new Popup`。骨架 DOM（`.popup`/`.popup-content`/`.result-control`/`data-result`/`popup-button-*`/crop 元素）被调用方以 `popup.dlg`/`popup.content.append`/`$(popup.mainInput)` 直读写——属**行为基础设施**，React 化零视觉收益而契约风险高。实测 `Popup.show.confirm` 正常（dialog.open、本地化按钮）。
- **`#dialogue_popup`/`#shadow_popup` + `callPopup`**：旧确认弹层路径。唯一调用点已在注释中，但 `callPopup` 经 `st-context.js` 暴露给第三方扩展——**契约面保留**。`callPopup` 对 `dialogue_popup_text` 做 `.empty().append(任意HTML)`，文本区本质是任意内容宿主（HostedDomSlot 语义），React 接管属反向错配。
- 开合动画/`.hidden`/定位等 shell 行为：各弹层既有契约，保留。

### 清单注「统一 popup 骨架组件先行」说明

该注写于各弹层尚未迁移之时；后续批次已逐面以独立 mount 落地，无需再补共享骨架组件。

## U5 台账

- 结论：已迁移验证通过，无实施提交
- 契约边界：`Popup` 骨架 + `callPopup`/`#dialogue_popup` 壳（扩展面）
- 文档：本档案
