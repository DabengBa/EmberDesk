# EmberDesk Documentation

Navigation only; every durable fact stays with its owner.

| Fact | Owner |
| --- | --- |
| Pages, features, terms and stable semantic IDs | [`.docs/db/`](db/) |
| Technical, operational, compatibility and external quirks | [`.docs/tech/`](tech/) |
| Accepted trade-offs and rejected approaches | [`.docs/adr/`](adr/) |
| Product direction and exclusions | [project-overview.md](project-overview.md) |
| Repository rules | [AGENTS.md](AGENTS.md) and [../AGENTS.md](../AGENTS.md) |
| Deterministic procedures | [../.agents/skills/](../.agents/skills/) |

Current implementation truth is in source, types, tests and the generated API/design-token/lockfile artifacts. Use `rg`, LSP and the matching tests before relying on documentation. Derived processing notes under [`.docs/logic-description/`](logic-description/) are not owners.

Run `pnpm run docs:check` after owner changes.
