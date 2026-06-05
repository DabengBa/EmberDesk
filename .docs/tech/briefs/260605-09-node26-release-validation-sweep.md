# Node 26 Release Validation Sweep Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 8 步在 Node.js 26.3.0 下做 release validation sweep，集中证明 lint、tests lint、docs、compat、startup/config、route-order、shared-library、user/auth/setup/login、full unit suite 和必要 E2E。

## Constraints

- 不把非 Node 26.3 的本地结果当 release proof。
- Full Playwright E2E 只在 release 或 visible UI slice 需要时作为 gate。
- 发现 failure 时按 failure surface 修复，不扩大为无边界重构。

## Implementation Traceability

Delivered status: completed on 2026-06-05.

Release evidence:

- Runtime versions: `node v26.3.0`, `npm 11.16.0`, `npx 11.16.0`, `bun 1.3.14`.
- Static gates passed: `bun run lint`, `bun run --cwd tests lint`, `bun run test:compat`, `bun run docs:check`.
- Shared-library proof passed: `bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand`.
- Character/route proof passed: `bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js express5-route-compatibility.test.js --runInBand` with 3 suites and 51 tests.
- Startup/user/auth proof passed: `bun run --cwd tests test:unit -- command-line.test.js server-startup-profiler.test.js startup-loader.test.js startup-deferred-tasks.test.js startup-critical-path.test.js user-storage.test.js user-storage-config.test.js user-auth.test.js user-directories.test.js user-migrations.test.js users-public-setup.test.js login-page-controller.test.js setup-page-controller.test.js --runInBand` with 13 suites and 97 tests.
- Full unit proof passed: `bun run --cwd tests test:unit -- --runInBand` with 63 suites and 689 tests.

Playwright decision:

- Playwright E2E was skipped for this validation slice because 09 only recorded release evidence, 08 changed documentation/toolchain closure facts only, 07 added compatibility tests/docs without public behavior changes, and 06 preserved visible copy, selectors, API shape, and slash-command registration while extracting a background loading-state helper.

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 8 步的用户意图。
- 2026-06-05: 完成 Node 26 release validation sweep；无代码、依赖或用户可见行为变更，后续进入 documentation topology closure。
