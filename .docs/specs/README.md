# Development Specs

This directory keeps active or future development specs, plus a small number of durable phase archive entrypoints that intentionally remain after dated `spec.md` / `plan.md` process files are deleted.

Completed React Phase 0, Phase 1, Phase 2, Phase 3, Phase 3B, Phase 4, Phase 5, and Phase 7 dated implementation specs have been removed from the active workspace. Durable completion records live in:

- [React modernization roadmap](../tech/react-modernization-roadmap.md)
- [Project history](../PROJECT_HISTORY.md)
- [User intent briefs](../tech/briefs/README.md)
- [Phase 4 archive brief](../tech/briefs/react-phase4-state-management-sequenced-specs.md)
- [Phase 7 archive brief](../tech/briefs/react-phase7-full-owner-cutover-sequenced-specs.md)
- Owning semantic docs under `../db/`
- Logic-description docs under `../logic-description/`

## Phase Entry Folders

| Folder | Roadmap phase | Purpose |
|---|---|---|
| [react-phase6-extension-compat](react-phase6-extension-compat/README.md) | Phase 6 | Durable phase-level entry for the completed extension compatibility evidence and JS-Slash-Runner gate. |
| [react-phase7-full-owner-cutover](react-phase7-full-owner-cutover/README.md) | Phase 7 | Durable phase-level entry for the completed full owner cutover and final shell/global decisions. |

## Active / Future Specs

| Folder | Spec set | Purpose |
|---|---|---|
| [260706-02-legacy-panel-control-cutover](260706-02-legacy-panel-control-cutover/spec.md) | Workspace React Replacement Roadmap | Bring legacy-hosted drawers such as AI Config, Advanced Formatting, Settings fallback, and Group Chats under the React shell/dock control plane. |
| [260706-04-supporting-panel-content-replacement](260706-04-supporting-panel-content-replacement/spec.md) | Workspace React Replacement Roadmap | Deepen World Info, Backgrounds, and Extensions from action-host islands into content owners with protected compatibility slots. |
| [260706-05-legacy-cutover-and-deletion-gates](260706-05-legacy-cutover-and-deletion-gates/spec.md) | Workspace React Replacement Roadmap | Decide deletion, freeze, or compatibility-facade status for remaining legacy owners after replacement slices land. |
| [260708-02-canonical-world-info-authority](260708-02-canonical-world-info-authority/spec.md) | Canonical SQLite Storage Roadmap | Move full World Info authority into canonical SQLite while preserving facade, regex, import/export, and delete-cascade compatibility. |
| Canonical storage control plane (delivered) | Comprehensive Database Authority Roadmap | Delivered slice registry, isolated audit/repair/rollback, backup readiness, and multi-slice operator status. See [canonical-sqlite-storage-roadmap](../tech/canonical-sqlite-storage-roadmap.md). |
| [260713-02-canonical-settings-document-authority](260713-02-canonical-settings-document-authority/spec.md) | Comprehensive Database Authority Roadmap | Make the complete settings document, revision, snapshots, and compatibility projection canonical. |
| [260713-03-canonical-secrets-authority](260713-03-canonical-secrets-authority/spec.md) | Comprehensive Database Authority Roadmap | Move secret records behind the existing `SecretManager` boundary without expanding plaintext exposure. |
| [260713-04-canonical-managed-media-authority](260713-04-canonical-managed-media-authority/spec.md) | Comprehensive Database Authority Roadmap | Make SQLite authoritative for media identity and lifecycle while retaining large content as database-managed files. |
| [260713-05-canonical-persona-authority](260713-05-canonical-persona-authority/spec.md) | Comprehensive Database Authority Roadmap | Normalize persona identity, defaults, descriptions, and connections out of the settings document. |
| [260713-06-canonical-extension-state-authority](260713-06-canonical-extension-state-authority/spec.md) | Comprehensive Database Authority Roadmap | Own extension registry, revisions, namespace state, and repair status while retaining managed Git worktrees. |
| [260713-07-canonical-chat-message-authority](260713-07-canonical-chat-message-authority/spec.md) | Comprehensive Database Authority Roadmap | Move character/group sessions, messages, swipes, metadata, and attachment references into canonical SQLite. |
| [260713-08-canonical-vector-catalog-and-index](260713-08-canonical-vector-catalog-and-index/spec.md) | Comprehensive Database Authority Roadmap | Canonicalize vector source/chunk/build catalogs while keeping embeddings as a rebuildable derived index. |

## Maintenance Rule

When a phase is completed and durable records have moved to the roadmap, project history, briefs, semantic docs, and logic-description docs, remove its dated implementation specs from this directory. Keep only the smallest phase-level archive entry that still helps future readers find the durable owners.
