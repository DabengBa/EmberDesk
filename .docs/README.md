# EmberDesk Documentation

Entry point for the maintained documentation in this directory. This file is
navigation only: every product, technical, and decision fact stays with its
owner below.

## Positioning And Stage

EmberDesk is a self-hosted browser LLM workspace derived from SillyTavern. It is
in a transition stage: keep the power-user workflow, simplify inherited
complexity, and modernize incrementally in React-owned slices while the
file-backed and canonical SQLite storage direction stays explicit.

Read [project-overview](project-overview.md) for the durable direction,
audience, capability set, and guardrails. Do not restate those facts here.

## Owners

| Fact | Owner | Notes |
| --- | --- | --- |
| Pages, features, terms | [`.docs/db/`](db/) | Semantic product database with stable IDs; validated by `pnpm run docs:check` |
| Implementation, architecture, operations | [`.docs/tech/`](tech/) | Current code is authoritative |
| Processing flows and sandbox proofs | [`.docs/logic-description/`](logic-description/) | Derived reasoning artifacts for storage and list flows |
| Accepted trade-offs | `.docs/adr/` | Created only when a hard-to-reverse decision needs a record |
| Repository rules | [AGENTS.md](AGENTS.md) and [../AGENTS.md](../AGENTS.md) | Instruction layer, not a knowledge base |

## Reading Order

1. [AGENTS.md](AGENTS.md) for the documentation workspace rules.
2. [project-overview.md](project-overview.md) for direction and boundaries.
3. [`.docs/db/pages/`](db/pages/) for user-visible surfaces,
   [`.docs/db/features/`](db/features/) for capabilities, and
   [`.docs/db/terms/`](db/terms/) for vocabulary.
4. The matching `.docs/tech/` owner for implementation detail, for example
   [main-chat-rendering-call-chain](tech/main-chat-rendering-call-chain.md),
   [workspace-composition-root](tech/workspace-composition-root.md), or
   [canonical-sqlite-storage-roadmap](tech/canonical-sqlite-storage-roadmap.md).

## Retrieval

```bash
pnpm run docs:tree
pnpm run docs:search -- "main chat rendering"
pnpm run docs:show -- .docs/tech/main-chat-rendering-call-chain.md
pnpm run docs:check
```

Retrieval narrows candidates; source, tests, and `docs:check` remain
authoritative.
