---
created: 2026-06-04
source: "User requested review verification of the ESLint/oxlint migration brief, then asked to fix the issues and write an upgrade spec design.md."
confirmed: true
last_updated: 2026-06-04
---

# Brief: 260604-07 ESLint Upgrade And oxlint Migration

## User Original Request

- "review核实内容 .docs\\tech\\briefs\\260604-07-eslint-upgrade-oxlint-migration.md"
- "修复问题 然后编写升级specs design.md"

Working interpretation: verify and correct the lint modernization research, then produce a shippable `.docs/specs/.../design.md` for the next safe upgrade slice.

## Background & Motivation

The project currently uses ESLint 8 with legacy `.eslintrc.cjs` files. Root `bun run lint` is green but slow enough to motivate a faster local preflight. ESLint 8 is EOL, while ESLint 9 requires flat config migration. oxlint offers a fast lint engine and migration tooling, but the current `@oxlint/migrate` path targets ESLint flat config; this project's legacy config must be mapped manually or first converted to flat config in a later ESLint 9 slice. oxlint should not be treated as a full replacement for this project until plugin coverage and ignored-path boundaries are proven locally.

The immediate need is to replace the previous broad research note with corrected, implementation-safe intent: preserve the current ESLint gate, add a non-authoritative oxlint fast lane first, and defer ESLint 9 / full oxlint replacement until their compatibility risks are explicitly handled.

## Confirmed Facts

| Area | Verified State |
|---|---|
| Runtime/package manager | Root `package.json` uses Node.js `>=26.3.0 <27`; Bun `1.3.14` is the package manager and script runner. |
| Root lint script | `bun run lint` runs `eslint "src/**/*.js" "public/**/*.js" ./*.js`. |
| Tests lint script | `bun run --cwd tests lint` runs `eslint "**/*.js" ./*.js` inside the tests package. |
| ESLint versions | Root uses `eslint ^8.57.1`; tests uses `eslint ^8.57.0`. |
| Plugin versions | Root has `eslint-plugin-jsdoc ^48.10.0`, `eslint-plugin-jest ^27.9.0`, and `eslint-plugin-playwright ^2.3.0`; tests package depends only on `eslint` directly. |
| Root config shape | `.eslintrc.cjs` is 130 lines, has 4 overrides, and defines 42 explicit rules. |
| Tests config shape | `tests/.eslintrc.cjs` is 54 lines and defines 16 explicit rules. |
| Root lint performance | `bun run lint` completed in 13.68 seconds in the review environment. |
| Root lint input size | ESLint processed 291 files and about 159,803 lines in the review environment. |
| Tests lint baseline | `bun run --cwd tests lint` currently fails with 162 reported problems; this is a separate baseline debt and must not be hidden inside the oxlint migration. |

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Research correction | Remove inaccurate or unsafe claims from the existing ESLint/oxlint migration brief | Corrected | 2026-06-04: review found incorrect rule counts, line count, tests lint baseline omission, npm command examples, and invalid oxlint category placement under `rules` | This brief now records corrected facts; detailed upgrade plan is moved to `.docs/specs/260604-10-eslint-oxlint-lint-modernization/design.md` |
| Fast lint lane | Introduce oxlint only where it can be validated without weakening the existing ESLint gate | Delivered | 2026-06-04: root `lint:fast` was delivered as a non-authoritative preflight with `oxlint@1.67.0` because `oxlint@1.68.0` was still blocked by the repository 7-day package cooling policy | `package.json`, `bun.lock`, `.oxlintrc.json`; delivery spec `260604-10-eslint-oxlint-lint-modernization`; root `bun run lint` remains the authoritative ESLint gate |
| ESLint major upgrade | Complete the lint-tooling upgrade rather than stopping at a fast-lint preflight | Delivered | 2026-06-04: user clarified that the upgrade action must be completed; current npm latest was ESLint 10.4.1, but the repository package cooling policy required the implementation to use `eslint@10.4.0` and `eslint-plugin-jsdoc@63.0.0` | `eslint.config.js`, `tests/eslint.config.js`, `package.json`, `tests/package.json`; `bun run lint` and `bun run --cwd tests lint` are both green |
| Tests package lint | Avoid presenting tests lint as a green baseline | Planned guardrail | 2026-06-04: local `bun run --cwd tests lint` failed with existing issues | First lint modernization slice records this debt but does not fix all tests lint errors |
| Bun command contract | Use Bun commands in project-owned migration steps | Planned | 2026-06-04: previous brief used `npm install`, `npm run`, and `npx` examples despite project Bun ownership | Future implementation should use `bun add -d`, `bun run`, and `bunx` / `bun x` where needed |

## Assumptions

- The first shippable slice is a tooling migration slice, not a user-facing product change.
- Existing `bun run lint` remains the authoritative closeout gate until a later approved design changes that contract.
- oxlint is introduced as a fast local preflight first; a failure or mismatch in oxlint must not block release until the rule mapping has been reviewed.
- The existing ESLint ignore surface is intentional, especially `public/lib/**`, vendored third-party extension artifacts, `plugins/**`, `src/tokenizers/**`, generated, cache, and data directories.
- The tests lint baseline is out of scope for the first oxlint fast-lane slice unless a later design explicitly targets tests lint remediation.

## Non-Goals

- Do not replace ESLint with oxlint in the first slice.
- Do not upgrade root or tests ESLint in the same slice that first introduces oxlint.
- Do not migrate `.eslintrc.cjs` to `eslint.config.js` inside the fast-lint slice; use the dedicated ESLint 10 completion spec.
- Do not make `bun run lint:fast` the required CI or delivery gate until rule coverage is proven.
- Do not pull `tests/` into the root lint scope.
- Do not change product behavior, runtime behavior, extension compatibility surfaces, or generated/vendor ignored directories.

## Source Trail

### Local

- `package.json`
- `tests/package.json`
- `.eslintrc.cjs`
- `tests/.eslintrc.cjs`
- `AGENTS.md`
- `.docs/tech/bun-workflow.md`
- `.docs/tech/modernization-phase0-baseline.md`
- `.docs/tech/modernization-roadmap.md`

### External

- ESLint v9 migration guide: https://eslint.org/docs/latest/use/migrate-to-9.0.0
- oxlint linter docs: https://oxc.rs/docs/guide/usage/linter
- oxlint configuration docs: https://oxc.rs/docs/guide/usage/linter/config.html
- oxlint migration docs: https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint.html
- oxlint JS plugins docs: https://oxc.rs/docs/guide/usage/linter/js-plugins.html

## Change History

- 2026-06-04: Initial research note existed as a broad migration report.
- 2026-06-04: Review verified local and external facts; corrected the document into a durable user intent brief and moved implementation design into a dedicated spec.
- 2026-06-04: Delivered the root oxlint fast lane as the first slice; ESLint 10 flat config and tests lint green-up remain assigned to `.docs/specs/260604-11-eslint10-flat-config-upgrade/design.md`.
- 2026-06-04: Delivered the ESLint 10 flat config completion slice; root and tests lint now use flat config, and tests lint is no longer a red baseline.
