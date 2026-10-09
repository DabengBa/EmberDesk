# Dossier：Character Authoring 高级感重构 + World Info 收尾层

> 面：`Character Authoring`（`rm_ch_create_block` React 面板）+ `WorldInfoPanel` workbench 视觉收尾
> 盘点日期：2026-09-22

## 盘点

### 可见面定位（先验证后动手）

- `hideLegacyCharacterAuthoringEditor(true)` 是唯一显隐开关：`#form_create` 设 `hidden`+`aria-hidden`+`data-legacy-character-authoring-hidden-by-react`。
- `#form_create` 本身已由 React 渲染（`RightNavPanel`/`CharacterPopup` 输出的隐藏兼容宿主），`actiontype` 属性仍决定 create/edit 模式，legacy `FormData` 读它取字段——保留，不动。
- 可见编辑器 = `app/workspace-panels.tsx` 的 `AuthoringWorkspacePanel`（`data-react-authoring-owner="characterAuthoring"`），挂在 `ensureCharacterAuthoringReactHost()` prepend 进 `rm_ch_create_block` 的 host。

### 契约锚点（不动清单）

- `data-react-authoring-field`（name/avatar/favorite/tags/characterWorld/description/firstMessage/alternateGreetings/systemPrompt/postHistoryInstructions/scenario/exampleMessages/depthPrompt.{prompt,depth,role}/creator/characterVersion/creatorNotes）
- `data-react-authoring-owner` / `-mode` / `-dirty` / `data-react-authoring-section`
- `#char-management-dropdown` 隐藏 select 是管理动作的兼容宿主：React `•••` 菜单打开时重读 live option（扩展后注入项可达）；`character_action_advanced` 被显式过滤——它是 React 已拥有字段的第二编辑器，不进菜单
- save model：`public/scripts/character-authoring.js` 的 `CHARACTER_EXTENSION_FIELD_MAP`（world→characterWorld、depth_prompt→depthPrompt、fav→favorite、talkativeness）+ `createCharacterAuthoringSaveModel`
- 契约测试：`tests/react-workspace-panels-helpers.test.js` 钉上述全部锚点

## 实施记录

### React 面板（`workspace-panels.tsx` + `workspace-panels.styles.ts`）

- 信息架构按频率+风险分层：`basics`（hero）→ `content` → `advanced`（折叠）→ footer 危险区。
- Hero 身份区：头像预览+换图遮罩（`#add_avatar_button` 桥上传）、大号 name input、favorite 星标切换、token/permanent chips（bridge 新增 `avatarUrl`/`tokenSummary`）。
- 短字段成行（tags+world、depth+role、creator+version）；长字段整行 + `max-height` 封顶（`textareaAuto` 38vh / `textareaPreview` 9.5em）+ autogrow。
- 折叠 `advanced`：`grid-template-rows 0fr→1fr` 动画 + `inert`/`aria-hidden`（DOM 常驻不破契约）；折叠头带内容 chips（`note@{depth}`/`v{version}`/system prompt/scenario/examples/creator/notes），chip 可点击 → 展开+scrollIntoView+focus 直达字段。
- 字段即编辑器：focus accent ring、脏字段圆点、`{{char}}/{{user}}` 宏 placeholder、label 侧字数 meta。
- 居中编辑器：全部长文本字段（description/firstMessage/systemPrompt/postHistoryInstructions/scenario/exampleMessages/depthPrompt.prompt/creatorNotes）label 挂展开图标 → `createPortal` 模态（Esc/遮罩/Ctrl+S/autoFocus）；`depthPrompt.prompt` 走 `getExpandedFieldValue`/`setExpandedFieldValue` 嵌套读写。
- 动作分层：create 模式唯一主钮 Create；edit 模式 autosave（900ms debounce）+ 状态点+文案（Saving…/N unsaved/Saved/失败重试）；World Info + `•••` 管理菜单右置；Delete 描边 ghost 危险钮沉左侧。
- `AuthoringFieldLabel`/`AuthoringTextarea`/`AuthoringActionsMenu` 复用组件收敛重复。

### 会话与桥接（`character-authoring.js` + `script.js`）

- `createCharacterAuthoringSession` 新增 `rebase(savedDraft)`：保存飞行中继续打字不丢 dirty——保存成功只推进 clean baseline，存活 diff 保持脏态。
- `shouldRemount(commandResult, commandName)`：`saveCharacterAuthoring` 在 edit 模式不 remount（否则每次 autosave 折叠 advanced、关掉正在输入的模态编辑器）；create 模式仍 remount 以便翻转到 edit。
- `persistAuthoringDraftBeforeLegacyAction`：edit 模式跑管理动作（rename/lore 导入等会服务端改 `characters[chid]`）前先把 draft 落盘，防止 remount 后下一次 autosave 用旧 draft 覆盖动作结果；保存失败则保留 live draft。
- `syncAuthoringDraftFromPopups`：legacy popup（alternate greetings、world info 绑定）写回 `create_save`/`characters[chid].data` 后同步进 React draft，remount 不丢 popup 编辑。
- 删掉全部 `hideLegacyCharacterAuthoringEditor(false)` 闪烁路径——popup 操作的是克隆模板+`FormData` 读隐藏 form，unhide 只会让 legacy 编辑器在 React 面下闪一下。
- `selectRightMenuWithAnimation`/`showWorkspaceChildSlotContent`：React 拥有面板时隐藏 `#result_info` token 行（token 数已进 hero chips）和 `#rm_button_selected_ch h2` legacy 标题（mount settle 后由 `mountReactCharacterAuthoringPanel` 补刀）。
- `alternate_greetings` 保存模型过滤空串；`CHARACTER_EXTENSION_FIELD_MAP` 补 `fav`/`talkativeness` 映射。

### World Info workbench 收尾（`world-info-workbench.tsx` + styles + `public/css/world-info.css`）

- 同一套手法：entry 列表 keyword chips（截断 +N overflow）、section icon+rule 头、`data-world-info-react-{field,section,action,advanced,editor,macro}` 标记族。
- Advanced 用原生 `<details data-world-info-react-advanced>` 手风琴；StyleX 表达不了 `[open]` 后代态，chevron 旋转和 legacy 隐藏守卫进 `world-info.css` 收尾层。
- `#wi-holder[data-world-info-visible-owner="react"]` 下 `data-legacy-world-info-hidden-by-react` 子节点强制 `display:none`（React 揭示 `#wiGlobalPanel` 时防嵌套节点复活）。

### 顺带修复

- `AdvancedFormattingPanel.tsx`：`data-preset-manager-htmlFor` → `data-preset-manager-for`（html2jsx 把 `for` 属性改写成 `htmlFor`，导致 `registerPresetManagers()` 扫 `select[data-preset-manager-for]` 永远落空——sysprompt/reasoning 两个 preset manager 实际未注册）。
- 删掉 dead style `authoringStyles.advancedChip`（只用了 `advancedChipButton`；world-info 侧的同名 `s.advancedChip` 在用，不动）。

## 门禁

| 门 | 结果 |
|---|---|
| tsc --noEmit | clean |
| build:react:workspace-panels | ✓ |
| test:compat | 111/111 |
| focused（react-workspace-panels-helpers / config-drawers-react-surface / character-authoring-facade） | 46/46 |

## 台账

- `.docs/db` 无语义更新：`feature.character_library_panel`/`page.chat_workspace`/`term.character_card` 只钉契约层（React sole-owner、legacy form hidden、fail closed），本次为结构/视觉层重构，契约断言全部仍成立。
- 明示不动的边界：`#form_create` 隐藏宿主 + `FormData` 读法、`#char-management-dropdown` option 桥、`#character_world`/`create_save` 写回路径、alternate greetings / world popup 仍为 legacy `callGenericPopup` 面、`#add_avatar_button` 上传通道。
- 遗留：modal 编辑器只覆盖文本类长字段；tags/alternate greetings 走各自专用路径不进 modal。
