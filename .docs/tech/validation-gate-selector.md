# Validation Gate Selector

## Module Responsibility

`src/validation-gate-selector.js` maps touched file paths or surface names to the focused validation commands that are most likely to prove the affected EmberDesk boundary. `scripts/validation-gate-selector.mjs` is a read-only CLI wrapper around the same selector.

The selector is advisory-only. It helps implementation and review agents start from a consistent validation shortlist, but final diff review still owns the decision to add, remove, or broaden gates.

## Architecture And Constraints

- Uses only Node.js standard-library-compatible JavaScript and project-local rule data.
- Does not run commands, start servers, change files, update package scripts, or replace CI/release proof.
- Keeps Bun as the script runner while preserving Jest and Playwright as the existing test frameworks.
- Returns command objects with `required` / `optional`, reason text, matched inputs, and local rule sources.
- Deduplicates overlapping surfaces so extension/regex/slash-command changes do not repeat `bun run test:compat`.

## Core Implementation

The first selector slice covers these high-risk surfaces:

| Surface | Command | Requirement | Rule sources |
|---|---|---|---|
| Canonical SQLite repair tooling, rollout contract, rollback blockers, DB-first authority seams | `bun run --cwd tests test:unit -- canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand` | required | `ADR-0011`, `canonical-sqlite-storage-roadmap.md`, `260707-07 canonical-sqlite repair/rollout spec` |
| Frontend compatibility, regex, slash commands, extension surfaces | `bun run test:compat` | required | `AGENTS.md`, `third-party-extension-compatibility.md`, `bun-workflow.md` |
| React workspace panels | `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js --runInBand` | required | `react-modernization-roadmap.md`, `bun-workflow.md`, `third-party-extension-compatibility.md` |
| React workspace panel bundle | `bun run build:react:workspace-panels` | optional | `bun-workflow.md`, `package.json`, `tests/playwright.config.js` |
| Express route/order | `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand` | required | `AGENTS.md`, `ADR-0010`, `ADR-0008` |
| Startup/config | `bun run --cwd tests test:unit -- command-line.test.js startup-critical-path.test.js startup-loader.test.js --runInBand` | required | `AGENTS.md`, `config-resolution.md`, `modernization-roadmap.md`, `ADR-0002` |
| User auth/storage/directories/migrations | `bun run --cwd tests test:unit -- user-auth.test.js user-storage.test.js user-directories.test.js user-migrations.test.js --runInBand` | required | `AGENTS.md`, `ADR-0003` |
| Derived cache / retired character index helper | `bun run --cwd tests test:unit -- derived-cache-sqlite.test.js interaction-performance-index.test.js --runInBand` | required | `ADR-0009`, `derived-cache-sqlite.md`, `interaction-performance-indexing.md` |
| Shared `/lib.js` | `bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand` | required | `frontend-shared-library-boundary.md`, `bun-workflow.md` |
| Semantic docs database | `bun run docs:check` | required | `AGENTS.md`, `.docs/db/scripts/doc-compiler.js`, `modernization-roadmap.md` |

Example:

```bash
node scripts/validation-gate-selector.mjs scripts/canonical-sqlite-repair.mjs .docs/db/pages/chat-workspace.md
```

The output lists advisory gates such as the canonical-storage rollout proof lane and `bun run docs:check`, including reason and source references. Owning tech docs like `.docs/tech/derived-cache-sqlite.md` and `.docs/tech/interaction-performance-indexing.md` resolve to the derived-cache helper gate. Current character read authority changes resolve through the canonical-storage route/service gates, not through a required sidecar availability gate.

## Validation

Focused proof:

```bash
bun run --cwd tests test:unit -- validation-gate-selector.test.js --runInBand
bun run docs:check
```

This proof checks path/surface matching, deduplication, CLI output, source references, and the rule that the helper must not recommend `bun test` as a replacement for focused Jest gates.

## Related Semantic IDs And Binding Points

Semantic IDs: none. This is a developer workflow helper and does not change user-visible product semantics.

Stable binding points:

- `src/validation-gate-selector.js`
- `scripts/validation-gate-selector.mjs`
- `tests/validation-gate-selector.test.js`
- `.docs/tech/validation-gate-selector.md`
