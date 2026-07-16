# React World Info Legacy 退休

## 意图与核心流程

让 React World Info workbench 通过明确 services 完成全部用户行为和 prompt/runtime 集成，不再依赖 legacy DOM、Select2、jQuery events 或 `world-info.js` facade ownership。

## 范围 / 不做范围

包括 World Info domain/service extraction、React direct actions/state、prompt/scan/regex/import/export/delete/persistence parity、public compatibility exports、legacy DOM/flag/fallback 删除。

不改变已批准 workbench 信息架构、World Info schema、API、storage authority、vector feature retirement 或 extension contract。

## 边界规则 / 验收

R1: React workbench 必须直接通过 typed/validated World Info service API 完成 world/entry select、create、edit、rename、duplicate、delete、search、sort、global activation、refresh、import/export 与 advanced fields；不得触发 legacy DOM。

R2: World Info scan、prompt placement、token budgeting、recursive/constant/probability/depth/group behavior 与 regex placement/order 必须保持现有输出；主聊天和 dry-run consumers 改用同一 service。

R3: `.json`、`.lorebook`、`.png`/embedded book import、converter、conflict、busy、cancel、batch result、export 和 `vectorized` compatibility round-trip 必须保持。

R4: delete cascade、character relation、global activation、current editor selection、canonical/file write、projection error 和 event emissions 必须保持，失败不得假成功。

R5: `@sillytavern/scripts/world-info` 及已支持 exports 必须继续解析；`public/scripts/world-info.js` 若保留，只能是薄 re-export/compat barrel，不得读取 UI DOM、拥有 mutable workbench state 或实现第二套 behavior。

R6: `world-info-body` legacy editor DOM、hidden adapter、Select2/action replay、`worldInfo` panel flag、mount/build fallback 和 legacy-only CSS/handlers 必须删除。相同 drawer entry 与 locked Character Management coexistence 保留。

R7: startup ordering 与 `eventSource` method binding 必须由 explicit service dependencies 保证，不能重新批量 import `public/script.js`。

R8: unit/compat/E2E 必须覆盖 scan/prompt、regex、import/export、delete cascade、desktop/mobile workbench、locked coexistence 和 extension imports；semantic docs 更新并通过 docs check。

## 架构 / 约束

- 将 pure conversion/filter/sort 与 stateful repository/action 分离，但只按现有 domain 职责拆分，不建立通用 plugin framework。
- React 使用 TanStack Query/Form 调用 service；service 不依赖 React。
- public compatibility barrel re-export service functions，保留 documented names。
- shell context 依赖改为显式注入或小型 capability provider，保持 lazy startup。
- 不新增依赖。

## 数据 / 集成

- World Info payload、entry fields、file/canonical representation 和 endpoint 保持。
- `vectorized`/`extensions.vectorized` 仅无损 round-trip，不重新暴露功能。
- events、prompt result shape 与 extension imports 保持。

## 验证

```bash
bun run --cwd tests test:unit -- world-info-card-rendering.test.js world-info-shell-context.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- world-info-workbench.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1
bun run docs:check
```

## Doc ID 契约

- `feature.world_info_panel`：完整 workbench behavior、runtime integration、sole owner 和 failure states。
- `page.chat_workspace`：same-entry drawer、prompt consumer 与 locked coexistence。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/world-info-shell-context.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/scripts/world-info.js`
- `app/world-info-workbench.tsx`
- `tests/world-info-shell-context.test.js`
- Inference：保留 module path、替换 module implementation，可同时满足第三方 import 稳定与 legacy runtime 删除。
