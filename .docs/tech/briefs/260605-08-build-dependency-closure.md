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

## Implementation Traceability

Delivered status: completed on 2026-06-05.

Evidence paths:

- `package.json` keeps the application runtime contract at Node.js 26.3.0 Current (`>=26.3.0 <27`) and `packageManager` at `bun@1.3.14`.
- `bunfig.toml` and `tests/bunfig.toml` keep `run.bun = false`, preserving Bun as package/script runner rather than app runtime.
- `webpack.config.js` remains scoped to `public/lib.js`, and `Dockerfile` still precompiles the shared browser library through `node ./docker/build-lib.js`.
- `.oxlintrc.json` and package scripts preserve `bun run lint` as the authoritative ESLint gate and `bun run lint:fast` as a non-authoritative oxlint preflight.
- No package, lockfile, Webpack, ESLint, oxlint, Docker, or Electron lifecycle changes were required.

Validation:

- `node --version`
- `bun --version`
- `bun run lint`
- `bun run lint:fast`
- `bun run --cwd tests lint`
- `bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand`
- `git diff --check`

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 7 步的用户意图。
- 2026-06-05: 完成 build/dependency closure；确认当前工具链角色无需代码或依赖变更，后续进入 Node 26 release validation sweep。
