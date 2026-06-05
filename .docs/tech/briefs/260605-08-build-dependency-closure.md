# Build Dependency Closure Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 7 步收束 Node/Bun/Webpack/ESLint/oxlint/dependency roles：确认 Node 26.3.0 是 app runtime，Bun 是 package/script runner，Webpack 继续守住 `/lib.js`，ESLint 是权威 lint gate，oxlint 是 fast preflight。

## Constraints

- 不做 broad dependency churn。
- 不替换 Webpack，除非 `/lib.js` contract 有等价 proof。
- 不把 Bun 改成应用 runtime。

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 7 步的用户意图。
