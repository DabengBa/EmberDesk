# React Legacy 退休兼容契约基线

## 意图与核心流程

把 EmberDesk 已承诺的扩展与自动化行为固化为与内部 provider 解耦的可执行契约。后续每个 retirement 包先证明 replacement 满足同一契约，再删除旧实现。

核心流程：测试加载 contract manifest；验证静态 public shape；启动浏览器 workspace；加载 JS-Slash-Runner primary fixture；验证 mount、events、slash、regex、message/character selectors；确认 internal bridge 未暴露为第三方 API。

## 范围 / 不做范围

包括 test-only contract manifest、focused unit assertions、Playwright runtime evidence、provider ownership/gate 文档。

不重写 globals、events、slash、regex、extension host、character list 或 main chat；不新增生产依赖或公开 compatibility bridge。

## 边界规则 / 验收

R1: contract manifest 必须按行为族记录 `globalThis.SillyTavern`、`eventSource`/`event_types`、`@sillytavern/*`、`/lib.js`、slash exports、regex exports/placements、extension mounts、character rows 和 message rows；不得把 legacy 文件路径定义为永久契约。

R2: `bun run test:compat` 必须从 manifest 验证 public name/value/selector 及 JS-Slash-Runner import consumer，且失败输出能定位具体 contract family。

R3: Playwright runtime proof 必须验证 JS-Slash-Runner 可挂载、订阅/发出代表性事件、执行代表性 slash command、调用 regex transformation，并观察稳定 character/message identity。

R4: runtime proof 必须覆盖扩展对 streaming/finalized message mutation 的最小代表路径，确保 React owner 不吞掉 `.TH-streaming`、`.TH-render` 或等价 extension-owned lifecycle。

R5: `__emberDeskReactCompatibilityBridge`、内部 Zustand snapshots 和 migration diagnostics 不得出现在 public manifest；测试必须证明 bridge attach/detach 不替换 public globals。

R6: 每个后续 retirement candidate 必须能在 manifest 中声明 current provider、replacement provider、proof command 和 deletion readiness；本包不引入动态 runtime registry。

R7: compatibility owning docs 必须说明该基线是行为 gate，不是冻结 legacy implementation；`bun run docs:check` 通过。

## 架构 / 约束

- manifest 放在 tests helper 范围，使用普通 JS structured data，避免新依赖。
- 现有 `third-party-extension-compatibility.test.js` 仍是 `test:compat` 入口，可拆 helper 但不改变脚本命令。
- 浏览器 fixture 使用 bundled JS-Slash-Runner 与本地 deterministic provider/DOM fixture，不依赖外网。
- provider readiness 是测试元数据，不进入生产 bundle 或用户 UI。
- public contract 只记录已支持行为，不借本包扩大 extension API。

## 数据 / 集成

- 不改变用户数据、extension settings、manifest schema 或安装协议。
- runtime evidence 只产生临时测试数据并在测试后清理。
- JS-Slash-Runner bundled source 是 primary consumer evidence；Quick Reply/Regex Manager 只补充其未覆盖风险。

## 验证

```bash
bun run test:compat
bun run --cwd tests test:unit -- global-compatibility-bridge.test.js character-list-structure.test.js chat-workspace-structure.test.js --runInBand
bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js --workers=1
bun run docs:check
```

## Doc ID 契约

- `term.shared_browser_library`：public imports/globals 行为边界。
- `feature.extension_panel_open`：mount 与 extension lifecycle。
- `feature.character_library_panel`：character selector/identity。
- `feature.chat_message_rendering`：message row 与 extension mutation。
- `page.chat_workspace`：events、slash、workspace runtime reachability。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `tests/third-party-extension-compatibility.test.js`
- `public/scripts/extensions/third-party/JS-Slash-Runner/src/index.ts`
- `public/scripts/extensions/third-party/JS-Slash-Runner/src/function/slash.ts`
- `public/scripts/extensions/third-party/JS-Slash-Runner/src/function/tavern_regex.ts`
- `app/compat/global-compatibility-bridge.js`
- Inference：结构化 test manifest 是复用现有兼容 assertions 的最小方式；它不要求生产 runtime 增加抽象。
