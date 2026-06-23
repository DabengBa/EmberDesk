# Compatibility Hardening Pass Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立临时交付设计文件；wrap-up 后持久入口改为本 brief、roadmap 和 project history。

## Intent

第 6 步把 extension、regex、slash command、`@sillytavern/*`、`public/lib.js` 与 character-list DOM identity 的测试边界刷新为 release boundary。

## Constraints

- 不删除 public compatibility surface。
- 不重命名 protected exports、selectors、aliases 或 regex placement values。
- 任何 public surface removal 必须另开 migration design。

## Implementation Traceability

Delivered status: completed on 2026-06-05.

Code and test paths:

- `tests/third-party-extension-compatibility.test.js` now freezes slash-command public exports alongside the existing extension mount point, Tavern Helper asset, `@sillytavern/*` alias, regex placement, event contract, and character-list row identity coverage.
- `tests/interaction-performance-index.test.js` now asserts `/api/characters/all`, `/api/characters/list`, and `/api/characters/get` do not expose internal read-service envelope fields such as `result`, `mode`, `latencyHint`, or `interactionPath`.
- `.docs/tech/third-party-extension-compatibility.md` records the protected slash-command export surface, the character route compatibility boundary, and the focused route proof command.

Validation:

- `bun run test:compat`
- `bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js character-list-structure.test.js --runInBand`
- `bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand`
- `bun run lint`
- `bun run docs:check`

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 6 步的用户意图。
- 2026-06-05: 交付 compatibility hardening pass；本切片只补测试和技术文档，不改变 public API、selectors、aliases、regex placement values 或用户可见行为。
