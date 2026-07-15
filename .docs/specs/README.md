# Development Specs

This directory keeps executable implementation packages. Runtime code and durable owning docs are
the source of truth; deleted or historical `spec.md` status text is not evidence that work remains.

## Active Packages

| Order | Folder | Purpose | Dependency |
|---|---|---|---|
| - | Delivered canonical chat foundation | Chat schema, stable IDs, lossless JSONL shadow import, and audit with JSONL runtime authority retained. | Delivered slice-gate maintenance; managed media |
| - | Delivered canonical chat authority cutover | Complete chat payload reads/writes use the audited canonical store with JSONL projection, replayable repair, and no server pagination. | Delivered foundation clean audit |
| - | Delivered canonical chat query and recovery | Search/recent now use canonical character/group query state, attachment writes fail before dangling commit, backup/restore journaling is validated against attachment manifests, and Node 26 proof is recorded. | Delivered chat authority cutover |
| - | Delivered extension operation safety | Harden install/update/switch/move/delete preflight under filesystem/Git authority with structured failure feedback. | Independent of chat |

Chat server pagination is not part of these packages. Current `/get` returns the complete chat and
`showMoreMessages()` slices the already-loaded browser array; pagination requires a separate
product/performance contract.

## Removed Legacy Process Records

The 2026-07-13 process directories were removed after the user confirmed they would not be
executed again:

- Delivered control-plane, settings, secrets, and managed-media facts remain in
  [canonical-sqlite-storage-roadmap](../tech/canonical-sqlite-storage-roadmap.md),
  [project history](../PROJECT_HISTORY.md), semantic docs, logic-description docs, and retained
  intent briefs.
- The persona-table proposal remains superseded because canonical settings, managed media, and
  chat metadata already provide the required ownership.
- The per-user extension-registry proposal remains superseded by extension operation safety.
- The oversized chat proposal was replaced by the three active chat packages above.
- The canonical vector-catalog and derived vector hardening proposals were replaced by first-party
  vector retirement after the user confirmed EmberDesk no longer needs the capability.

No current implementation or durable architecture explanation depends on the removed process
records.

## Maintenance Rule

- Verify code and durable docs before treating an old process package as current.
- Active packages require `brief + spec.md + feature.toml + plan.md + evidence/`.
- Completed packages should move durable facts to owning docs before process-record deletion.
- Do not keep broken links or list non-existent directories as active work.
