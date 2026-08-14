# 意图与核心流程

冻结 `public/script.js` 的 Workspace Composition Root 边界，并切断最高频反向依赖：已抽出的事件、请求上下文和公共 API 由 `public/scripts/` 独立模块拥有，根文件负责装配、批准契约 re-export 和调用 `bootstrapWorkspace()`。尚未拆出的领域状态、DOM handler、React bridge 和 legacy workspace 实现仍保留到后续独立波次。Workspace 和扩展行为不变。

核心流程：`script.js` 对已抽出边界只做装配和公共契约 re-export；`public/scripts/**` 直接从 `events.js`、`request-context.js`、`public-api.js` 导入对应模块；`test:compat` 和 focused contract tests 覆盖契约。

## 范围 / 不做范围

包括：ADR、导出/反向导入/循环清单、静态 allowlist 测试、events.js 直接导入、request-context 切断 CSRF/getRequestHeaders 反向、public-api 切断 SillyTavern 装配、script.js re-export 批准名称、删除旧实现。

不做范围：领域状态 owner（settings/character/chat/generation）、React 适配器拆分、Character Library/Authoring 迁移、Main Chat 迁移、DOM controller 拆分、零反向导入。`script.js` 在这些后续波次完成前继续保留相应 legacy owner；本波次不宣称其已成为 assembly-only 文件。

## 边界规则 / 验收

R1: 所有 internal 模块不得从 script.js 导入 eventSource/event_types/getRequestHeaders。
R2: 静态测试 forbid 新文件或新名称从 script.js 导入（allowlist 缩小）。
R3: test:compat 覆盖 events/request-headers/public API 契约。
R4: script.js 仍导出批准名称和调用 bootstrapWorkspace()。
R5: 领域状态和 React 适配器仍依赖 script.js 路径（allowlisted）。
R6: 回滚是 PR revert 或上一版本部署。

## 架构 / 约束

- 严格遵循 ADR-0012 React sole owner。
- 复用 existing world-info-shell-context.js 模式：script.js 注册，模块不导入 script.js。
- 每个可变状态只能有一个 owner。
- 不要引入万能 shell-context 或第二套 store。
- 保留已批准公共契约直到替换行为证明。
- 保留 third-party JS-Slash-Runner 等 public consumers 仍可从 script.js 路径导入（public API）。

## 数据 / 集成

- 不变：用户数据、扩展契约、public API 形状。
- 切断：internal 模块对 script.js 的 eventSource/event_types/getRequestHeaders 反向依赖。
- 保留：script.js re-export 批准名称。

## 验证

```bash
pnpm run test:compat
# 静态测试（新增）
# 单元测试 request-context CSRF 头形状和安装时机
# 文档检查
```

## Doc ID 契约

- `term.shared_browser_library`: 公共契约边界
- `feature.startup_bootstrap`: 启动契约
- `page.chat_workspace`: 工作区运行时契约

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/world-info-shell-context.md`
- `public/scripts/events.js`
- `public/scripts/world-info-shell-context.js`
- `public/scripts/scrapers.js` (getRequestHeaders consumers)
- `tests/world-info-shell-context.test.js` (静态导入断言模式)
