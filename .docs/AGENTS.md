# Documentation Workspace

`.docs/db/` is the semantic product-document database. Keep user-visible
pages, features, and terms there and preserve their stable IDs. Derived cache
files, projections, exports, and indexes are not authority. Technical,
operational, compatibility, external-quirk, and cross-boundary invariant facts
belong in `.docs/tech/`; durable architectural decisions and rejected
alternatives belong in `.docs/adr/`.

Raw source material is immutable. Process documents, temporary specs, drafts,
and troubleshooting traces MUST exist only in untracked `.tmp/`. One fact has
one owner: update the existing owner of a changed fact instead of creating a
duplicate summary. Run `pnpm run docs:check` after semantic documentation
changes and `python3 .agents/skills/l5-doc-governance/scripts/check_doc_budgets.py --repo .`
for owner budgets; generated files under `.docs/db/dist/` are validation output
and are not committed.

Use `pnpm run docs:tree`, `pnpm run docs:index -- --topic <topic>`,
`pnpm run docs:search -- <query>`, and `pnpm run docs:show -- <path>` to narrow
documentation retrieval before broad source inspection. These commands are the
Node/pnpm equivalent of the read-only runtime described by the documentation
workflow; they do not modify the documentation tree.
