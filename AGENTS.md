# AGENTS.md

> Boot contract for AI agents working on EmberDesk.

## Commands

```bash
pnpm run <build:lib|build:react|start|start:no-csrf|test:unit|test:component|test:integration|test:compat|test:e2e|test:all|test:inventory|docs:check|docs:build|typecheck|lint>
(cd tests && pnpm install --frozen-lockfile)
python3 .agents/skills/l5-doc-governance/scripts/check_doc_budgets.py --repo .
```

Use the Node.js version declared by `package.json` for server release proof. pnpm is the package manager and script runner.

For focused E2E runs, pass arguments directly: `pnpm --dir tests run test:e2e world-info-workbench.e2e.js --grep "UI hardening"`. An extra `--` reaches Playwright and stops option parsing, potentially running the whole suite. Keep the default isolated data root/server; do not reuse a user's running server for mutating tests.

## Owner routing

| Question | Read |
| --- | --- |
| Product direction, audience, exclusions | `.docs/project-overview.md` |
| User-visible pages, features, terms | `.docs/db/pages`, `.docs/db/features`, `.docs/db/terms` |
| Technical, operational and compatibility boundary rules | `.docs/tech/` |
| Accepted trade-offs and rejected approaches | `.docs/adr/` |
| Deterministic procedures | `.agents/skills/*/SKILL.md` |
| Documentation workspace rules | `.docs/AGENTS.md` |
| Implementation truth | source, types, tests, linter, design tokens, lockfile, git and PR history |

Rules that cannot be inferred from code are owned by `.docs/tech/`, `.docs/adr/`, `.docs/project-overview.md`, and `CONTRIBUTING.md`. Read matching owners before changing user-visible behavior or accepted architecture. `.docs/db/` holds stable semantic Doc IDs; keep them and update the existing owner instead of creating a duplicate summary. The four-level `docs:*` retrieval commands are in `.docs/AGENTS.md`.

Run `pnpm run docs:check` or `pnpm run docs:build` after `.docs/db` changes.

## Governance

- Long-form project documentation belongs under `.docs/`; keep root `AGENTS.md` concise.
- Process documents, temporary specs, drafts and troubleshooting traces MUST exist only in untracked `.tmp/`; MUST NOT enter the git index.
- Keep credentials, cookies, session tokens, and exported browser storage out of the repository.
- Choose the narrowest focused tests for touched code first. For Express route/order changes, run `pnpm --dir tests run test:unit -- express5-route-compatibility.test.js --runInBand`. For config/startup changes, run focused command-line/startup tests. For user/auth/storage changes, run the matching `user-*`, login/setup, and E2E tests. For frontend compatibility surfaces, run `pnpm run test:compat`. For shared library changes, run `frontend-shared-library-boundary.test.js`.
- Inspect `git diff` before finishing and do not revert unrelated user changes.
- Do not modify the `release` branch directly.
- Do not add dependencies without a project-specific reason and validation plan.
- Do not change the license.
- Do not turn derived caches or indexes into canonical user-data storage.
- Do not clean untracked project files or proactively `git add` untracked files.
