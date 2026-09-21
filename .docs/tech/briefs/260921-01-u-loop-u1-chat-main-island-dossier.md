# U-loop U-1 面档案：聊天主岛（消息列表 + 消息行 + ChatComposer）

> U0 盘点产物，2026-09-21。工作流：`.docs/tech/ui-ux-modernization-workflow.md`。供 U1 设计提案引用。

## 范围

`#chat` 消息列表（含 `#show_more_messages`、slash 自动补全/详情浮层、WelcomePanel 挂载位）+ 消息行 `MainChatMessageRow` + `#send_form` ChatComposer。

## 1. 实现栈：React + jQuery 深度混合

**React 持有**（workspace-panels bundle，挂 `#chat` / `#send_form` / `#nonQRFormItems`）：

- 消息列表：`MainChatMessageListWorkspacePanel`（`app/workspace-panels.tsx:1061`）→ `MainChatMessageRow`（`app/components/main-chat/MainChatMessageRow.tsx`，571 行），行根 `data-main-chat-message-row-owner="react"`。
- `#show_more_messages`、slash autocomplete/details/status 浮层、WelcomePanel。
- `ChatComposer`（`app/components/composer/ChatComposer.tsx`）：6 枚 icon 控件已是 ContractIconButton。

**jQuery 残余点**：

- `send_textarea` 非受控（Quick Reply / STscript `/send` / macros / impersonate / autocomplete 走 `.val()`+input 契约）；bridge 对 input/focus/key\*/click 挂 `scheduleMainChatMessageListPanelRefresh`（`public/script.js:2166-2174`）。
- Composer 显隐：`activateSendButtons`/`showStopButton`/`deactivateSendButtons`/`unblockGeneration` 写 `body[data-generating]` + `.css('display')`；`#send_form.no-connection`/`.compact` 由 legacy 切换。
- 行内按钮委托（React 行内无 onClick 的 11 枚）：`mes_hide`/`mes_unhide`/`mes_embed`/`mes_media_list`/`mes_media_gallery` → `chats.js`；`mes_swipe_picker`+`.swipes-counter` → `swipe-picker.js`；`mes_create_branch` → `chat-branch.js`；`mes_prompt` → `itemized-prompts.js`（pointerup 委托）；`mes_translate`/`sd_message_gen`/`mes_narrate` → 扩展激活面（`body.translate`/`body.sd`/`body.tts`，repo 内无 handler）。
- 删除模式：`openMessageDelete` 逐行 `.css('display','grid')` 翻 `.del_checkbox`，`#send_form`↔`#dialogue_del_mes` 互换（`public/script.js:8383-8395`）。
- 滚动：`scrollChatToBottom`/`scrollLock`/`is_animation_scroll` 读 jQuery `state.chatElement`；mount 后跑 scroll-restore。
- MutationObserver 桥：`send_form`/`form_sheld`/`body[data-generating]` 属性变化 → 全量重投影（`public/script.js:2177-2204`）。
- 流式：每 token `state.chat[i].mes=` → rAF 节流全量 snapshot 投影 → 行 `dangerouslySetInnerHTML` 重设（`generation-service.js` → `scheduleMainChatMessageListPanelRefresh`）；`animateSwipe` 仍直写 `.mes_text` `.html('...')`（`generation-service.js:2345`，React DOM 上的瞬时直改，随后被重渲染覆盖）。
- `lib/swiped-events.js` 触摸手势、`optionsPopper` 锚 `#options_button`、`#file_form` 隐藏表单三件套、`mes_timer`/token counter DOM 写（仅非 React 分支）。

## 2. 样式来源

| 来源 | 覆盖 |
|---|---|
| `public/style.css`（7156 行） | 主导：`.mes*` ~230 命中、`.mes_buttons`/`.extraMesButtons` 25、composer 系 27、`stscript` 16、行部件 ~225；含 `body[data-generating]`/`[data-swiping]` 隐藏族、`.mes:hover .mes_buttons` hover-opacity |
| `public/css/mobile-styles.css` | `#chat` 边框/overflow、`#send_form.compact`、`.mes_buttons` 字号与 hit-size |
| `public/css/toggle-dependent.css` | body 功能开关类：`tts`/`sd`/`translate`/`no-timer`/`no-timestamps`/`no-tokenCount`/`no-mesIDDisplay`/`hideChatAvatars`/`documentstyle`/`expandMessageActions` 等 |
| StyleX | 仅 `app/styles/composer.styles.ts` 的 `idleHidden`（mes_stop 初始态）；WelcomePanel 已 StyleX 化 |
| 内联 | React `style={{display}}` 条件位 + jQuery `.css()` 直改 |
| 相关 | `file-form.css`（附件条）、`streaming-display.css`（fade-in 仅 legacy 分支）、`welcome-panel.styles.ts` |

## 3. 契约面（不可破坏）

- **ID**：`#chat` `#send_form` `#send_textarea` `#send_but` `#mes_stop` `#mes_continue` `#mes_impersonate` `#options_button` `#nonQRFormItems` `#leftSendForm`/`#rightSendForm` `#stscript_{continue,pause,stop}` `#file_form`/`#file_form_input`/`#embed_file_input`/`#file_form_reset` `#show_more_messages` `#curEditTextarea` `#dialogue_del_mes` `#message_template`/`#past_chat_template`（cloneNode 契约仍活：扩展与非 React 路径使用）。
- **`.mes` 属性/状态类**：`mesid`/`ch_name`/`is_user`/`is_system`/`type`/`title`；`is_user`/`last_mes`/`lastInContext`/`swipes_visible`/`last_swipe`/`reasoning`/`smallSysMes`/`toolCall`/`displayNone`。
- **行内 class 全族**：`for_checkbox`/`del_checkbox`/`mesAvatarWrapper`/`avatar img`/`mesIDDisplay`/`mes_timer`/`tokenCounterDisplay`/`swipe_left`/`swipe_right`/`swipes-counter`/`swipeRightBlock`/`mes_block`/`ch_name`/`name_text`/`mes_ghost`/`timestamp`/`mes_buttons`/`extraMesButtonsHint`/`extraMesButtons`/全部 `mes_*` 按钮/`mes_edit_buttons`+`mes_edit_*`/`mes_reasoning_*`/`reasoning_edit_textarea`/`mes_text`/`mes_media_wrapper`/`mes_file_wrapper`/`mes_bias`/`generation_failure_*`/`empty_reply_regenerate`/`generation_auto_recovery_status`/`edit_textarea`/`code-copy`。
- **body 级**：`data-generating`/`data-swiping`/功能开关类/`documentstyle`/`expandMessageActions`；`#send_form.no-connection`/`.compact`。
- **owner 标记**：`data-main-chat-message-row-owner`、`data-react-main-chat-owner`、`data-main-chat-windowing-owner`、`data-main-chat-load-more-owner`、`data-main-chat-slash-ui-owner`、`data-main-chat-composer-owner`（dom-handlers 分支判定 + 测试断言双用）。
- **事件**：MESSAGE_SENT/RECEIVED/EDITED/UPDATED/DELETED、MESSAGE_REASONING_EDITED/DELETED、CHARACTER_MESSAGE_RENDERED/USER_MESSAGE_RENDERED、GENERATION_STARTED/STOPPED/ENDED、CHAT_CHANGED、swipe/渲染相关。
- **`@sillytavern` 面**：`getContext().chat`、扩展对 `.mes`/`.mes_text` 的 DOM 变异宿主（`extension-mutated` row state 为此保留）。
- **测试钉住**：chat-workspace-structure、chat-message-actions-controller、chat-composer-react-surface、main-chat-message-row-i18n、main-chat-store-projection、chat-generation-lifecycle、chat-generation-command-service、react-runtime-boundary；e2e：chat-message-streaming、chat-message-rendering、panel-navigation、walkthrough。

## 4. 状态清单

welcome 可见 / 空会话（仅首条问候）/ 常规列表 / 窗口化（show_more + 滚动锚定恢复）/ 流式中（`data-generating`：send 系隐藏、stop 显示、last_mes 按钮隐藏）/ swiping / 生成失败（notice + retry 钮）/ 自动恢复（`generation_auto_recovery_status` primary/fallback）/ 空回复 regenerate CTA / 行编辑（`edit_textarea` + 7 钮）/ reasoning 开合 + 编辑态 / swipe 显示 + counter + picker / 隐藏消息（ghost + hide/unhide）/ 删除模式（del_checkbox + form 互换）/ no-connection（placeholder + form class）/ STscript 执行中三钮 / 附件条（file_form）/ slash 补全 + 详情 + paused/aborted/error / `extension-mutated` 行 / compact composer / 移动窄视口 / 主题（SmartTheme 变量 + documentstyle 等 body 类）。

## 5. 痛点记录

- `.mes_buttons` 默认 opacity 0.34，靠 hover/focus-within 提亮——触摸端无 hover（mobile 补到 0.78 仍是弱化态）。
- `extraMesButtons` 单层平铺 11 枚 icon-only 按钮；删除与 copy/translate 同级，危险动作无视觉分层。
- 行内动作全是 `<div role="button">` 非真 button；hit area ≈ `mainFontSize×1.45`（~21px），低于 44px 触控基准。
- 流式每 token 全量 snapshot 重投影 + 行 innerHTML 重设——长会话渲染成本（windowing 缓解中）。
- **疑似 React 化缺口（U1 前需确认）**：
  - `.mes_timer` 生成计时在 React 行渲染为空（projection 无 timer 字段；`formatGenerationTimer` 写值仅走 `updateMessageElement` 非 React 路径）。
  - `mes_prompt` 被 React 行硬编码 `display:none`，靠 `updateMessageItemizedPromptButton` 直改 DOM `.show()`——React 重渲染会打掉。
  - `missing-avatar` img onError 兜底、`timestamp_model_icon` SVG 图标未投影进 React 行。
- swipe counter 用 `\u200b/\u200b` 零宽连接符 hack；删除模式整换 composer 区域，模式感突兀。
- composer `no-connection` 仅靠 placeholder 文案 + form class，无独立状态可视。

## U1 决议（2026-09-21 用户拍板）

经 3 个 demo HTML 比选（`.tmp/u1-demo/variant-{inline,grouped,menu}.html`）：

- **溢出区形态**：浮层菜单（变体 C）——`⋯` 触发浮层，分组+文字标签+危险项沉底；行高不被撑开。类名/委托链全保留。
- **Tier1 常驻**：维持现状 `⋯`+`✎`（copy 留在溢出区内）。
- **`.mes_buttons` 可见性**：维持 hover 渐显（0.34→1）。
- **缺口修复纳入本轮**，U0 基础上复核扩为 6 项：
  1. `mes_timer` 生成计时投影（`formatGenerationTimer` → record 字段）。
  2. `mes_prompt` 可见性投影（`state.itemizedPrompts` 按 mesId 命中）。
  3. `.icon-svg` 模型图标投影（`power_user.timestamp_model_icon` + `extra.api`/`extra.model`）。
  4. avatar `onError` → `.missing-avatar` 兜底（React 行内状态）。
  5. `mes_swipe_picker` 可见性投影（`canOpenSwipePickerForMessage`）。
  6. `.swipes-counter` enabled 态投影（`swipe-picker-enabled`+`interactable` 类、role/tabindex/title，`canJumpToSwipeForMessage` 区分 title）。
- **浮层裁剪约束**：`.mes_block` 有 `overflow:hidden`，浮层需 `:has(.extraMesButtons.visible)` 放开裁剪 + 行 z-index 抬升（菜单随消息滚动是期望行为）。
- **样式落点约定**：契约类的视觉规则在 `style.css` 原位改（`.mes*` 规则同时服务 `#message_template` 克隆兼容路径，不能整族迁走）；净新增非契约 chrome 才走 StyleX。`.mes*` 规则族的 StyleX 归零归 Phase X 收敛。

## U2 实施摘要（2026-09-21 完成）

- `app/components/main-chat/MainChatMessageRow.tsx`：`⋯` 触发浮层 `.extraMesButtons.visible`（4 分组：扩展槽/检查/媒体与隐藏/Copy+删除），`aria-expanded`/`aria-haspopup`，开菜单聚焦首个可见项，Esc 关菜单回焦触发钮，菜单外点击（行内行外）经 `actionsExpanded` 状态关闭；6 缺口全部投影修复；meta strip 归一（`mes_timer`/`tokenCounterDisplay`/模型图标挂点）；avatar `onError` → `missing-avatar`。
- `public/scripts/main-chat-store-projection.js` + `app/stores/main-chat-store.ts`：新增 `timer`/`timerTitle`/`modelIconApi`/`modelIconTitle`/`promptButtonVisible`/`swipePickerEnabled`/`swipePickerCanJump`/`mediaDisplay`/`inlineMediaText`/`reasoningState`/`reasoningType` 字段，投影层保持 DOM-free。
- `public/script.js`：bridge state 接线（`formatGenerationTimer`/`itemizedPrompts`/`power_user.timestamp_model_icon`/`canOpenSwipePickerForMessage`/`canJumpToSwipeForMessage`/`getMediaDisplay`）——已并入 B-cut-13 提交 `96e91c427`。
- `public/style.css` + `public/css/toggle-dependent.css`：浮层形态（`position:absolute` 挂 `.mes_buttons`、`:has(.visible)` 放开 `.mes_block` 裁剪 + 行 z-index 抬升）、主题变量配色、分组分隔线、标签、危险项 `var(--warning)`、`max-height:min(60vh,420px)` 滚动、移动端 36px hit area、`expandMessageActions` 下摊平回行内（group `display:contents` + 标签隐藏）；`#send_form.no-connection` 边框/底色警示化；`.del_checkbox` ~1.3em。
- 已知边界：菜单不做贴底自动上翻（有 max-height 滚动兜底）；itemized-prompts 退役后 `mes_prompt` 恒隐藏（inert 数组，字段留作无害投影）。

## U3 视觉走查

**已由用户验收**（2026-09-21）：真实实例预览走查通过（"看起来没问题, 过"）。自查证据：菜单开合/分组/标签/危险项/裁剪/z-index/Esc 回焦/行内外点击关闭在真实 DOM 上验证无异常。

## U4 门禁

- focused jest 8 套件 147/147 ✓（chat-message-actions-controller / main-chat-message-row-i18n / chat-generation-lifecycle / main-chat-store-projection / main-chat-store / chat-workspace-structure / react-workspace-panels-helpers / react-runtime-boundary）
- `pnpm run test:compat` 110/110 ✓
- `tsc --noEmit` ✓；eslint（改动 JS）✓
- `pnpm run build:react:workspace-panels` ✓
- e2e：chat-message-layout（4/4）/ chat-message-rendering（含 actions+edit lifecycle、delete mode）/ chat-message-list-walkthrough / chat-message-streaming ✓（streaming 一例在 4-worker 全量跑抖动一次，单跑通过，非本改动路径）

## U5 台账

- **新形态**：`.extraMesButtons` 由行内平铺 → `⋯` 触发的浮层分组菜单；Tier1 常驻 `⋯+✎` 不变；hover 渐显不变。
- **契约保留声明**：`.mes`/`.mes_block`/`.mes_buttons`/`.extraMesButtons*`/全部 `mes_*` 按钮类/`role=button`/`aria-label`/`title`/`data-i18n`/jQuery 委托链/`expandMessageActions` 平铺兼容/`#message_template` 克隆路径均保留；`.docs/db` 语义契约（`feature.chat_message_actions`）不变，无需更新。
- commit：`b9e2e44c9 feat(ui): U-1 main-chat message actions as floating grouped menu`
