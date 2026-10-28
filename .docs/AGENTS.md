# Documentation Workspace

`.docs/db/` is the semantic product-document database. Keep user-visible
pages, features, and terms there and preserve their stable IDs. Implementation
and operational facts belong in `.docs/tech/`; durable architectural decisions
belong in `.docs/adr/` when that directory exists.

Raw source material is immutable. Update the existing owner of a changed fact
instead of creating a duplicate summary. Run `pnpm run docs:check` after
semantic documentation changes; generated files under `.docs/db/dist/` are
validation output and are not committed.

Use `pnpm run docs:tree`, `pnpm run docs:index -- --topic <topic>`,
`pnpm run docs:search -- <query>`, and `pnpm run docs:show -- <path>` to narrow
documentation retrieval before broad source inspection. These commands are the
Node/pnpm equivalent of the read-only runtime described by the documentation
workflow; they do not modify the documentation tree.
