# Settings 工作区 Overlay 设计指导

> 版本 1.0 · 2026-07-20 · 面向 `spec.md` / `plan.md` Task 1–2 实现者

---

## 1. 设计判断

### 当前问题

| 维度 | 问题 |
|---|---|
| **层级断裂** | 点击 Settings 整页跳转，聊天上下文丢失；与其余所有面板（同页 toggle）的交互逻辑不一致 |
| **信息密度落差** | 完整页 `settings-layout` 最宽 1280px、两栏；overlay 必须在 workspace 层内工作而不感觉被"缩水" |
| **文案噪音** | `.settings-page-summary`（约 1-2 行描述）、`.settings-tabs-description`、状态标签"ready/opening"在频繁开关路径上都是干扰 |
| **打开路径摩擦** | AI Config / Formatting 现在整页跳 `/settings?tab=`，与它们在 shell 中的按钮位置感知不匹配 |

### 目标体验

> 点击 AI Config，overlay 在聊天背后滑入，落到 Providers tab，改完关闭，聊天上下文原封不动。

---

## 2. 信息架构与交互

### 2.1 Overlay 形态选择

**推荐：居中大面板（centered modal dialog）**，而非右侧抽屉。

理由：Settings 内容包含 `settings-grid`（两列字段）、`settings-side-panel`（360px 固定侧栏）、inline panel 等宽结构；右侧抽屉在 ~400–600px 宽度下会把这些布局全部降为单列，失去现有 CSS 已设计好的节奏。居中大面板可保留原有 `settings-layout` 的两栏比例，用户不会感觉"缩水"。

**尺寸规格：**

```
宽屏（≥ 900px viewport）：
  宽  min(92vw, 1180px)
  高  min(92dvh, 880px)
  溢出内容内部滚动（.settings-main-panel overflow-y: auto）

窄屏（< 640px）：
  宽  100vw
  高  100dvh（或 100dvh - var(--topBarBlockSize) 留出 shell chrome）
  上边距  var(--topBarBlockSize)  保证关闭按钮不被 shell 遮盖
```

中等屏（640–899px）：宽 96vw，高 92dvh，单列布局继承 `settings-grid` 的响应降级。

### 2.2 打开 / 关闭路径

| 入口 | 打开 overlay | 初始 tab |
|---|---|---|
| shell **Settings** 按钮 | 打开 | `general` |
| shell **AI Config** 按钮 | 打开 | `providers` |
| shell **Formatting** 按钮 | 打开 | `advanced` |
| legacy drawer toggle（如残留） | 同上，不恢复 legacy content owner | — |

**关闭路径（全部须实现）：**
- overlay 右上角关闭按钮（`aria-label="Close settings"`）
- `Escape` 键（焦点在 overlay 内任意元素时）
- 再次点击当前 active 的 shell 入口按钮（toggle 语义，与其他面板一致）

**焦点行为：**
- 打开时：焦点移入 overlay（推荐第一个 tab 按钮或 overlay 容器本身）
- 关闭时：焦点归还到触发按钮（shell nav button）
- 焦点陷阱：overlay 打开期间 Tab 循环在 overlay 内，不得逃出到聊天背后的 DOM

### 2.3 与其他面板的关系

默认策略（与 spec R6 一致）：**Settings 为独立 overlay 层，不占 child-slot pin。**

- 打开 Settings overlay 时，其余已打开的 child-slot panel（Character Library、World Info 等）**不强制关闭**，但 dock `activePanelKind` 标记切换到 `settings` / `aiConfig` / `advancedFormatting`。
- Settings overlay 有自己的 backdrop，视觉上覆盖整个 workspace（包括其他 panel），不需要先关闭其他 panel。
- 关闭 overlay 后，`activePanelKind` 清除，之前打开的 panel 的 active 态不自动恢复（用户行为已明确关闭了 Settings）。

### 2.4 完整页 vs Overlay 的 chrome 差异

| 元素 | 完整页 `/settings` | Overlay |
|---|---|---|
| `.settings-page-title` | 显示（display 级，1.5rem 700） | **隐藏/降级**：overlay header 可只显示当前 tab 名称（title 级，1.05rem 600），无需重复 "Settings" |
| `.settings-page-summary` | 显示 | **删除/aria-only**：见第 4 节 |
| `.settings-workspace-link`（返回 Workspace）| 显示 | **替换为关闭按钮** |
| `.settings-side-panel`（Info/Quick Links）| 显示 | **可选隐藏**：节省宽度；若空间足够保留，若 overlay 宽 < 900px 则隐藏 |
| backdrop（模糊遮罩） | 无 | **有**，见第 3 节 |

---

## 3. 视觉规范（可实施）

### 3.1 Surface / Backdrop / Border / Shadow

**Overlay 容器（`[data-settings-overlay="true"]` 或 `role="dialog".settings-overlay`）：**

```css
/* 使用 DESIGN.md 已有 tokens，不引入新设计语言 */
background: var(--settings-surface-raised);
  /* = color-mix(in srgb, var(--settings-surface) 78%, var(--black70a) 22%) */
border: 1px solid var(--settings-border);
border-radius: 10px;          /* rounded.lg，与 panel/popup 一致 */
backdrop-filter: blur(calc(var(--SmartThemeBlurStrength, 10) * 1px));

/* 单一 shadow，不与 border 堆叠成 ghost-card */
box-shadow:
  0 0 0 1px color-mix(in srgb, var(--settings-border) 60%, transparent),
  0 8px 32px color-mix(in srgb, var(--black70a) 55%, transparent);
/* 选择其一：border 或 shadow ring，本项目选 border + 环境阴影（无装饰性投影） */
```

**Backdrop（`[data-settings-overlay-backdrop="true"]`）：**

```css
background: color-mix(in srgb, var(--SmartThemeBlurTintColor) 72%, transparent);
backdrop-filter: blur(calc(var(--SmartThemeBlurStrength, 10) * 2px));
/* 与现有 #shadow_popup 双倍 blur 的做法一致 */
```

### 3.2 Z-index 层级建议

```
shell chrome (#emberdesk-react-workspace-shell-chrome-host)  z-index: 3010
child-slot panels / drawers                                   z-index: ~3000–4100
Settings overlay backdrop                                     z-index: 4150
Settings overlay dialog                                       z-index: 4200
toasts / tooltips                                             z-index: 9999+（不变）
```

Settings 必须高于所有 child-slot panels，低于 toasts。

### 3.3 Header 精简策略

**去掉 `.settings-page-summary`**（见第 4 节）。

overlay 内 header 只需：
```
[当前 tab 名称]                            [×]
```

- tab 名称用 `.title`（1.05rem 600）不用 `.display`（1.5rem 700）；overlay 不是页面入口，不需要强调层级
- 关闭按钮：`menu_button`，内含 `<i class="fa-solid fa-xmark">` + `aria-label="Close settings"`，尺寸与 shell nav button 视觉对齐

### 3.4 Tabs

**靠 active 态引导，不靠 tab 说明文字：**

- `.settings-tab[data-active='true']` 已有 amber 边框 + 背景混合，足够清晰
- **删除** `.settings-tabs-description`（或降为 aria-only，见第 4 节）
- Tab 间距保持 `gap: 5px`（spacing.sm），不拉开
- Overlay 内 tabs 若空间不足，允许横向滚动（`overflow-x: auto; scrollbar-width: none`）而非换行堆叠

### 3.5 Save Bar 主次 CTA

```
[ 状态文案（dirty/saving/saved/error） ]       [ Discard ]  [ Save ]
```

- **Save**（`.settings-button--primary`）：amber 边框 + 背景，视觉重量明显
- **Discard / Cancel**（`.settings-button--secondary`）：`background: transparent`，退至次位
- 状态文案用 `color: var(--settings-muted)`，不加图标/徽章，仅文字即可
- 本切片不做 dirty-close confirm；关闭按钮直接关闭，未保存草稿丢弃

### 3.6 Loading / Error / Success / Conflict 状态

延用 `.settings-status--*` 体系，**无状态徽章**：

| 状态 | 处理方式 |
|---|---|
| 加载中 | overlay 内显示 `.settings-status--info`：简短骨架或 spinner（替换 section 内容区，不覆盖整个 overlay） |
| 保存成功 | `.settings-status--success` 短暂出现（4s 后 `SAVE_STATUS_TIMEOUT_MS` 已有），无 toast 重复 |
| 保存失败 / API 错误 | `.settings-status--error`，一行错误原因，不清空 overlay chrome |
| Revision conflict | 保留现有完整页逻辑：显示冲突提示 + reload 按钮，本切片不改行为 |
| Dirty（未保存）| save bar 内文案 "Unsaved changes"，不加徽章、不加顶部横幅 |

### 3.7 Motion

```css
/* overlay 入场 */
@keyframes settings-overlay-in {
  from { opacity: 0; transform: scale(0.97) translateY(-4px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}

.settings-overlay[open] {
  animation: settings-overlay-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* backdrop */
.settings-overlay-backdrop {
  animation: settings-overlay-in 150ms ease-out both;
  /* 仅 opacity，无 transform */
}

@media (prefers-reduced-motion: reduce) {
  .settings-overlay[open],
  .settings-overlay-backdrop {
    animation: none;
  }
}
```

时长：入场 200ms，退场 150ms（exit animation）。不超过 250ms。不用 bounce/elastic。

---

## 4. 文案蒸馏清单

以下文案在 overlay 路径下应删除或降为 `aria-only`（clip-path: inset(50%) 隐藏）：

| 位置 | 类名 / 内容 | 处置建议 |
|---|---|---|
| settings header | `.settings-page-summary`（如"Configure your AI settings..."一类说明） | **overlay 内删除**；完整页保留 |
| settings tabs | `.settings-tabs-description`（tab 区下方描述段落） | **aria-only**（已在大多数情况下隐藏，但确认 overlay 中不渲染可见版本） |
| WorkspacePanelShell 状态标签 | `getWorkspacePanelVisibleStatusLabel`: "ready", "opening", "needs setup" | Settings overlay 不使用 `WorkspacePanelShell` 包裹，无需处理；但确认 overlay 本身不再输出这类 badge |
| shell chrome status copy | "Workspace ready"、"Character Library ready"（当前 shell 清理已进行） | 继续清理，overlay 实现时不回引入 |
| overlay header 重复标题 | 若用 `<h2>Settings</h2>` + tab 名称同时显示 | 二选一：只显示 tab 名称；或 `Settings` 只在 overlay 首次打开（tab=general）时显示 |
| save bar 状态 | 避免 "Changes saved successfully!" 这类长句 | 用 "Saved" 或 "Saving…" 即可 |

---

## 5. Shell 对齐

### 与当前 shell chrome 清理方向统一

| 原则 | 当前状态 | 对齐动作 |
|---|---|---|
| **icon-first，narrow = icon-only** | `.react-workspace-shell-nav-button span` 窄屏已隐藏（见 style.css L6666） | 保持；Settings 按钮遵守同一规则 |
| **少字** | shell 正在清理 "Workspace ready" 等文案 | overlay 不引入类似 copy |
| **active pressed 即反馈** | `data-workspace-shell-panel-active="true"` + amber 背景（style.css L6627） | overlay 打开时，对应 shell 按钮 `aria-pressed="true"` + active 样式必须激活；关闭时清除 |
| **入口一致性** | Settings / AI Config / Formatting 三个按钮应与其他 panel 按钮视觉一致 | 不对 Settings 按钮添加任何特殊标记、badge 或 tooltip 前缀 |

**shell nav button active 的 CSS 已就位**（L6627）：
```css
.react-workspace-shell-nav-button[data-workspace-shell-panel-active="true"] {
  /* amber 背景 mix */
}
```
实现时只需确保 `dockSnapshot.activePanelKind` 在 overlay 打开时正确设置为 `settings` / `aiConfig` / `advancedFormatting`。

---

## 6. 验收级 UI 检查点

> 对应 spec R1–R9 的可观察 UI 结果

| 编号 | 对应 Req | 可观察检查点 |
|---|---|---|
| U1 | R1 | 点击 Settings，URL 不变（仍 `/`），viewport 出现 overlay，`.settings-page` 内容可编辑 |
| U2 | R2 | AI Config 打开后 tab `[data-active='true']` 对应 Providers；Formatting 对应 Advanced |
| U3 | R3 | Esc 关闭 overlay；关闭后 shell 按钮 `aria-pressed="false"`；`#send_textarea` 仍可聚焦 |
| U4 | R3 | overlay 关闭按钮（`×`）可见，点击关闭 |
| U5 | R3 | 再次点击已 active 的 shell Settings 按钮 → overlay 关闭（toggle） |
| U6 | R6 | overlay 打开时，Character Library 等其他 panel 不被强制关闭；overlay 有单一焦点陷阱 |
| U7 | R7 | 保存失败时 overlay chrome（header/tabs/close）仍可见，不清空 |
| U8 | R8 | 窄屏下 overlay 近似全屏，顶栏无横向滚动；shell 关闭按钮可达 |
| U9 | R1/R3 | overlay 内 `.settings-page-summary` 不渲染；状态文案无"ready"徽章 |

---

## 7. 建议并入 spec/plan 的补丁要点

### 7.1 追加到 `spec.md` 的「UI 流程/视觉约束」条目

1. Overlay 形态为居中大面板（`<dialog>` 或等价 `role="dialog"`），宽屏下 `min(92vw, 1180px)` × `min(92dvh, 880px)`；窄屏（< 640px）近似全屏，上偏移 `var(--topBarBlockSize)` 以露出 shell 关闭路径。
2. Backdrop 使用 `--SmartThemeBlurTintColor` 72% 透明度 + 双倍 `--SmartThemeBlurStrength` 模糊，与现有 `#shadow_popup` 做法一致；z-index 4150，overlay dialog 4200。
3. Overlay 内不渲染 `.settings-page-summary`；`.settings-workspace-link` 替换为关闭按钮（`×`，`menu_button`，`aria-label="Close settings"`）。
4. Overlay header 展示当前 tab 名称（title 级 1.05rem）而非重复 "Settings" 大标题（display 级 1.5rem）。
5. Tab 说明文字 `.settings-tabs-description` 在 overlay 内降为 `aria-only`；active tab 状态由 amber 边框 + 背景混合（已有 `.settings-tab[data-active='true']`）传达，不依赖文字引导。
6. Save bar 状态文案不超过 3 字（"Saved" / "Saving…" / "Error"）；不加状态徽章或 banner；行内 `color: var(--settings-muted)` 显示。
7. Overlay 入场动画 200ms `cubic-bezier(0.22, 1, 0.36, 1)`，opacity + scale(0.97→1) + translateY(-4px→0)；backdrop 150ms opacity only；`@media (prefers-reduced-motion: reduce)` 无动画。
8. overlay 打开期间 shell 对应 nav button `aria-pressed="true"` + `data-workspace-shell-panel-active="true"` 样式激活；关闭时清除，与其他 panel 切换语义完全一致。

### 7.2 plan 补丁

**建议在 Task 2「在 workspace shell 挂载独立 Settings overlay」下追加一条设计落地子任务：**

> **Task 2-D（non-behavior）：Settings Overlay UI 约束落地核查**  
> **Reqs:** R1, R3, R8  
> **Scope:** overlay 容器 CSS（新增 `.settings-overlay` / `.settings-overlay-backdrop`）、overlay header JSX（关闭按钮、tab 名称）、`globals.css` overlay 变体  
> **Proof:** 截图验证：overlay header 无 `.settings-page-summary`；narrow viewport 无顶栏横向滚动；shell active button 样式在 overlay 打开期间激活  
> **Notes:** 不改动字段逻辑，只增 CSS + 条件渲染（overlay 模式下隐藏 summary/workspace-link，显示关闭按钮）。
