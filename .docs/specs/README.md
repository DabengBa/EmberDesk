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
| [260708-03-canonical-settings-secrets-authority](260708-03-canonical-settings-secrets-authority/spec.md) | Canonical SQLite Storage Roadmap | Migrate settings and secrets authority into canonical storage without leaking secret material or breaking React/legacy settings surfaces. |
| [260708-04-canonical-vectors-assets-authority](260708-04-canonical-vectors-assets-authority/spec.md) | Canonical SQLite Storage Roadmap | Migrate vectors and assets metadata authority with provider/asset repair and compatibility boundaries. |
| [260708-05-canonical-personas-backgrounds-authority](260708-05-canonical-personas-backgrounds-authority/spec.md) | Canonical SQLite Storage Roadmap | Migrate personas and backgrounds metadata/state authority while preserving gallery, selection, lock, and slash-command behavior. |
| [260708-06-canonical-extension-storage-authority](260708-06-canonical-extension-storage-authority/spec.md) | Canonical SQLite Storage Roadmap | Migrate extension storage authority while preserving protected extension mount points and public compatibility surfaces. |
| [260708-07-canonical-chat-message-bodies-authority](260708-07-canonical-chat-message-bodies-authority/spec.md) | Canonical SQLite Storage Roadmap | Migrate chat message bodies from JSONL authority into canonical SQLite after structured storage slices are stable. |

## Maintenance Rule

When a phase is completed and durable records have moved to the roadmap, project history, briefs, semantic docs, and logic-description docs, remove its dated implementation specs from this directory. Keep only the smallest phase-level archive entry that still helps future readers find the durable owners.
