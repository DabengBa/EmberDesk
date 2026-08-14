---
created: 2026-08-13
source: user
confirmed: true
last_updated: 2026-08-13
feature_slug: workspace-composition-root-contract
status: delivered
---

# Workspace Composition Root Contract

## 原始请求

用户要求把 `public/script.js` 收缩为 Workspace Composition Root，并为 `public/scripts/**` 建立反向导入不得新增契约。

## 目标结果

冻结 `public/script.js` 的 Workspace Composition Root 边界，并切断最高频反向依赖：已抽出的事件、请求上下文和公共 API 由 `public/scripts/` 独立模块拥有，根文件负责装配、批准契约 re-export 和 `bootstrapWorkspace()` 调用。`script.js` 中尚未拆出的领域状态、DOM handler、React bridge 和 legacy workspace 实现仍保留到后续独立波次。Workspace 和扩展行为不变。

## Checkpoint A

- **目标结果**：冻结 composition-root 边界，切断最高频反向依赖；已抽出的契约不再经由 `script.js` 倒进口，尚未拆出的 legacy owner 不在本波次伪装成已完成。
- **切分前基线**：约 17k 行 monolith，约 74 个 `/script.js` 反向导入者（含一个 vendored third-party bundle），约 248 个导出和数十个循环，包含事件/请求/CSRF/公共 API 装配。
- **假设**：
  1. 切断事件/请求/公共 API 反向依赖是最高收益的立即动作。
  2. 后续领域状态和 React 适配器可以分批迁移。
  3. `script.js` 仍需保留公共契约 re-export，并在后续领域拆分完成前继续承载未迁移 legacy owner。
- **硬约束**：
  - 不新增全局 service locator、万能 app-state、第二套 store。
  - React adapter 只负责状态投影和命令转发。
  - 每份可变状态只能有一个 owner。
  - 保留已批准公共契约（eventSource/event_types/globalThis.SillyTavern 等）直到替换行为被证明。
  - 回滚是部署上一版本，不保留 fallback。

## 生产级交付主题

### 主题 1: 冻结 Composition Root 契约并切断最高频反向依赖
- 范围：ADR、导出/反向导入/循环清单、静态 allowlist 测试、events.js 直接导入、request-context 切断 CSRF/getRequestHeaders 反向、public-api 切断 SillyTavern 装配、script.js re-export 批准名称。
- 不做范围：领域状态 owner（settings/character/chat/generation）、React 适配器拆分、Character Library/Authoring 迁移、Main Chat 迁移、firstLoadInit/DOM controller 拆分、零反向导入。
- 完成条件：静态测试 forbid 新反向导入（allowlist 缩小）、events/request-headers/public-api 消费者改 import、新模块不反向导入/script.js、test:compat 绿、`script.js` 仍保留公共契约 re-export 和 bootstrap 调用。
- 发布/回滚边界：PR revert 或上一版本部署。无 fallback。

## 范围 / 不做范围

包括：导出清单、静态反向导入测试、events/request-context/public-api 切断、script.js re-export 批准名称、删除旧实现。

不做范围：后续领域状态、React 适配器、Character Library、Main Chat、启动/DOM 拆分、零反向导入。

## 边界规则 / 验收

R1: 所有 internal 模块不得从 script.js 导入 eventSource/event_types/getRequestHeaders。
R2: 静态测试 forbid 新文件或新名称从 script.js 导入（allowlist 缩小）。
R3: test:compat 覆盖 events/request-headers/public API 契约。
R4: script.js 仍导出批准名称和调用 bootstrapWorkspace()。
R5: 领域状态和 React 适配器仍依赖 script.js 路径（allowlisted）。
R6: 回滚是 PR revert 或上一版本。

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

## 交付追溯

- 架构决策：[ADR-0014](../../adr/0014-workspace-composition-root.md)
- 稳定代码边界：`public/script.js`、`public/scripts/events.js`、`public/scripts/request-context.js`、`public/scripts/public-api.js`
- 契约验证：`tests/helpers/script-js-reverse-import-contract.js`、`tests/script-js-composition-root.test.js`、`tests/third-party-extension-compatibility.test.js`
- Owning docs：`term.shared_browser_library`、`feature.startup_bootstrap`、`page.chat_workspace`
