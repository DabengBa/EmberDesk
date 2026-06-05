# Low-Risk Frontend Controller Slice Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 5 步选择一个低风险 frontend panel 或 toolbar root，沿用 login/setup controller pattern，抽出纯 helper、controller initializer、dependency injection 和 cleanup。

## Constraints

- 不碰 main chat workspace、message rendering、streaming、extension mount points、slash-command parser 或 regex internals。
- 不引入 React、Vue、TypeScript application code 或 SPA router。
- 不改变 UI copy、API shape 或 shared browser compatibility surface，除非 design 明确批准。

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 5 步的用户意图。
