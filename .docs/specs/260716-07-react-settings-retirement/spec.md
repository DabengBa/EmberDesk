# React Settings Legacy 退休

## 意图与核心流程

让认证用户在 `/settings` 完成所有通用、provider/API、UI、formatting 与 power-user 设置，不再依赖 workspace settings drawers。加载、编辑、secret 操作、保存、并发冲突与返回 workspace 均保持现有结果。

## 范围 / 不做范围

包括 settings owner inventory、完整 React coverage、provider/connection/secret、UI/theme/formatting/advanced、route sole owner、legacy drawer/flag/fallback 删除。

不包括 World Info、Backgrounds、Extensions、Persona 专属管理流程，也不改变 settings document、secret schema、provider API 或 storage authority。

## 边界规则 / 验收

R1: `/settings` 必须覆盖当前 `#user-settings-block`、API Configuration 和 Advanced Formatting 中仍受支持的通用配置；coverage ledger 在完成时不得存在可由这些 legacy drawers 访问但 React 无法编辑的字段。

R2: provider/model、custom base URL、reverse proxy、connection profile、service-account/Vertex、fallback provider 和各 provider secret 必须保持现有显示条件、validation、save/clear 与安全边界；secret 不进入 settings JSON。

R3: UI/theme tokens、custom CSS、chat display、MovingUI、formatting、prompt/context/instruct/reasoning、tokenizer、streaming、auto-swipe/continue、STscript 与其他 power-user values 必须无损 round-trip，包括未知或旧枚举值。

R4: `/api/settings/get`/`save` 的完整 payload、unknown fields、`settings_revision`、409 conflict、projection repair 和 file/canonical authority 行为不变；保存只改变用户实际编辑字段。

R5: 保存成功后当前 workspace/startup consumers 必须应用与刷新后一致的值；保存失败或 conflict 保留用户上下文并要求 reload/merge，不得假成功。

R6: `features.react.pages.settings`、`src/react-settings-feature.js`、`/settings -> /` fallback、Settings/AI Config/Formatting 的 legacy drawer forms 与只为其服务的 handlers 必须删除。Workspace navigation 的 Settings entry 始终进入 `/settings`。

R7: build 缺失不回退到 legacy drawer；release build gate 阻止缺失产物，诊断环境给出明确错误。

R8: desktop/mobile、keyboard、dirty/save/busy/error/409、secret、provider-specific 和 reload persistence 必须有自动化证据；`page.settings` 与相关 docs 更新并通过 docs check。

## 架构 / 约束

- 继续使用 `app/lib/settings-helpers.js` 的 path binding + structured clone 模式，扩展覆盖而不手写平行 settings object。
- React 使用现有 TanStack Form/Query 与 Zod；不引入新 state framework。
- settings route 继续由 `src/users.js` auth middleware 保护。
- 现有 endpoints 和 SecretManager 是唯一持久化入口。
- 专属 feature settings 可保留在 document 中，但其专属 UI 不迁入本页。

## 数据 / 集成

- 保持完整 JSON document、revision 和 unknown-field preservation。
- 连接 profiles、presets/themes 等目录聚合继续由 `/api/settings/get` 提供。
- secret field 只调用现有 secret helpers。
- 对 legacy enum/value 采用 round-trip，不在加载时强制归一化。

## 验证

```bash
bun run --cwd tests test:unit -- settings-react-route.test.js settings-get-route.test.js canonical-settings-store.test.js secrets-input-map.test.js --runInBand
bun run build:react
bun run --cwd tests test:e2e -- settings.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1
bun run docs:check
```

新增/扩展 E2E 必须覆盖每个 owner domain、secret、409、reload persistence 和 mobile。

## Doc ID 契约

- `page.settings`：完整 settings sole owner、route、states、save/conflict/secret。
- `page.api_configuration`：其用户可见通用配置被 `/settings` 接管后更新或标记为 superseded surface。
- `page.chat_workspace`：Settings navigation 不再打开 fallback drawer。
- `feature.chat_completion_select`、`feature.custom_base_url`、`feature.fallback_provider`：provider behavior 保持。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `app/routes/settings.tsx`
- `app/lib/settings-helpers.js`
- `src/users.js`
- `public/script.js`
- `tests/settings-react-route.test.js`
- `.docs/db/pages/settings.md`
- Inference：按现有 owner domains 补齐 coverage 比复制 legacy drawer DOM 更容易验证字段完整性和 unknown-field preservation。
