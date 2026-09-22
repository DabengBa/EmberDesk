# UI/UX 现代化工作流（U-loop）

> 适用范围：退役后存活的核心/关联 UI 面的逐个 review、重构与改进。与删除流水线（`.docs/tech/feature-retirement-workflow.md` 的 R-loop）**并行但不重叠**——已列入无关清单的面不进 U-loop。
>
> 技术底座已定：**StyleX**（样式系统）+ **Astryx**（React 组件/设计系统）。新 React 代码直接写 StyleX；存量 Tailwind/旧 CSS 随各面重构一次性转掉，不做并行长期共存。

## 0. 前置：设计基座（P0，一次性）

所有面重构共用，先做完再开面循环：

- **设计 token 层**：StyleX `create`/`defineVars` 的主题变量表。
- **主题契约红线**：EmberDesk 有用户可选主题（`SmartTheme*` CSS 变量系）。组件必须消费 CSS 变量，**禁止硬编码颜色/字体/圆角**——否则用户主题会被局部击穿。
- **Astryx 映射表**：现有控件形态 → Astryx 组件的对照清单（button/icon-button/toggle/select/input/textarea/dialog/tooltip/menu），放进 `.docs/tech/stylex-astryx-migration-plan.md` 或新建映射文件，每面重构直接引用。
- **布局原语**：面板壳（header/actions/content/footer）、drawer、popup、toolbar 的统一骨架组件。
- **评审基准**：dev server 常驻 + `browser_preview` 预览入口；Playwright 截图脚本（`.tmp/`）用于留档对比。

## 1. U-loop 单面循环

```
U0 面盘点 → U1 设计提案(用户拍板) → U2 实施 → U3 视觉走查(用户验收) → U4 门禁 → U5 台账+提交
```

### U0 面盘点（开发者，无用户）

产出一页「面档案」，回答：

- **实现栈**：React / legacy jQuery / 混合（混合面列出 jQuery 残余点：事件委托、DOM 直改、`trigger('click')` 类）
- **样式来源**：StyleX / style.css / mobile-styles / 内联 / Tailwind 残留
- **契约面**：DOM id、`@sillytavern` 导入、事件名、测试钉住的 selector——重构不可破坏项
- **状态清单**：该面的全部视觉状态（空/加载中/有数据/错误/禁用/移动端/各主题）
- **痛点记录**：已知的 UX 问题（信息层级、间距、可点击区域、键盘可达性）

### U1 设计提案（→ 用户拍板，阻塞门）

开发者给出提案，**用户确认后才动代码**：

- 目标布局描述（可附 ASCII 线框或截图标注）
- 信息层级与控件归并方案（哪些删、哪些合、哪些挪）
- 状态映射表：U0 状态清单 → 新设计下每个状态的表现
- 契约兼容性声明：哪些 DOM id/事件必须保留，哪些可换实现

**用户拒绝/修改 → 回到 U1 开头**，不进 U2。

### U2 实施（开发者）

- StyleX + Astryx 重写结构与样式；jQuery 残余事件改 React 绑定或 `st-context` 兼容导出
- 旧 CSS 规则**随面删除**（死 CSS 不留）
- 契约面（DOM id/事件/导入）原样保留——视觉可变，接口不可变
- 分小步提交到面分支，U3 走查前不合并

### U3 视觉走查（→ 用户验收，阻塞门）

起 dev server，用户按状态清单逐个过目：

| 必查状态 | 内容 |
|---|---|
| 空态 | 无数据/首次进入 |
| 常态 | 典型数据填充 |
| 密集态 | 长列表/长文本/多元素 |
| 错误态 | 加载失败/操作失败 |
| 移动端 | 窄视口布局 |
| 主题×2 | 至少暗色 + 一个用户主题抽样 |

用户逐项打钩或提修改意见 → 修改后**重新走查**，直到全绿。

### U4 门禁（开发者）

```bash
pnpm run lint            # eslint + tsc
pnpm run test:unit       # 聚焦 + 全量
pnpm run test:compat     # 契约面必跑
pnpm run build:react && pnpm run build:react:workspace-panels && pnpm run build:react:character-library
pnpm --dir tests run test:e2e <相关文件>.e2e.js
pnpm run docs:build      # 改了 .docs/db 后
```

### U5 台账 + 提交

- 台账记录：面的新旧形态、契约保留声明、视觉走查确认状态、commit hash
- 用户视觉走查的确认**写进台账**（"U3 已由用户验收"字样 + 日期）
- commit 前缀：`feat(ui): <面> refactor` / `style(ui): ...`

## 2. 面排序（按用户触达频率 × 风险降序）

| 序 | 面 | 归属 | 形态 | 特殊依赖 |
|---|---|---|---|---|
| U-1 | **聊天主岛**：消息列表 + 消息行 + ChatComposer | 核心 | React+jQuery 混合 | 最高频面；消息操作行/swipe/媒体网格/文件嵌入全在这；契约 DOM id 密集 |
| U-2 | **右导航**：角色列表 + 角色详情卡 | 核心 | 混合（详情卡 jQuery 残余多） | 角色选择器契约（`.character_select`/`data-chid`/`CharID*`）是测试钉住面 |
| U-3 | **OptionsMenu + SelectChatPopup** | 核心 | React | 会话管理入口 |
| U-4 | **AI Config 面板** | 核心 | React | 预设管理主面；provider 单源后字段集会变化（B-cut-12 后做） |
| U-5 | **AdvancedFormattingPanel** | 核心 | React | instruct-mode 退役后做（B-cut-13 后字段集稳定） |
| U-6 | **Settings 页**（四 tab） | 关联 | React | provider 退役后字段集稳定再做 |
| U-7 | **WorldInfoPanel** workbench | 核心 | React | 条目编辑器结构复杂，单独一轮 |
| U-8 | **CharacterLibraryPanel** | 核心 | React | 网格/批量模式/工具栏 |
| U-9 | **PersonaManagementPanel** | 关联 | React | |
| U-10 | **Extensions host** | 关联 | React+legacy 容器 | `*_container` 空槽清理并入此轮 |
| U-11 | **弹层族**：CharacterPopup/ContextMenu/TagManagement/ExportFormat/ChatBackups/MacroBrowser/DialoguePopups | 混合 | React | 统一 popup 骨架组件先行 |
| U-12 | **login/setup 页** | 基础设施 | React | 低优先级收尾 |

**排序理由**：U-1~3 是每分钟都在用的面，早做收益最大；U-4~6 等退役批落地后字段集稳定再动；U-7~9 独立大块；U-10~12 低频次面收尾。

## 3. 与退役流水线的协调规则

- **不做**：U-loop 范围内的面若含「将退役模块」的 UI（如 AdvancedFormatting 里的 instruct 控件、AI Config 里的 claude/makersuite 字段、extensions 抽屉里的 QR 槽）——**先等对应退役批落地，或在该面重构时顺手剥离**（按「剥离接线再删模块」原则，剥离部分记入退役台账）。
- **不回退**：StyleX 化是单向门——转过的面不再回 jQuery+style.css 模式。
- **每轮独立**：单面 PR/commit 独立，不跨面合并，方便用户逐面验收回滚。

## 4. 单面验收完成定义

- [ ] U1 提案经用户确认
- [ ] 契约面零破坏（compat 全绿 + DOM id/事件清单逐项核对）
- [ ] U3 六状态全部经用户视觉验收
- [ ] U4 门禁全绿
- [ ] 台账 + 语义文档同步 + commit 落盘
