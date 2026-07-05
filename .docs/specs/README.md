# React Development Specs

This directory only keeps active or future development specs, plus a small number of durable phase archive entrypoints that intentionally remain after dated `spec.md` / `plan.md` process files are deleted.

Completed Phase 0, Phase 1, Phase 2, Phase 3, Phase 3B, Phase 4, Phase 5, and Phase 7 dated implementation specs have been removed from the active workspace. Durable completion records live in:

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
| [260701-02-react-workspace-chrome](260701-02-react-workspace-chrome/spec.md) | Next Workspace Shell | Future same-entry React chrome takeover for current `/`. |
| [260701-03-panel-dock-and-drawer-coordination](260701-03-panel-dock-and-drawer-coordination/spec.md) | Next Workspace Shell | Future React shell ownership for panel dock and drawer coordination. |
| [260701-04-main-chat-layout-and-composer-shell](260701-04-main-chat-layout-and-composer-shell/spec.md) | Next Workspace Shell | Future React shell ownership for main-chat layout and composer shell. |
| [260701-05-responsive-and-recovery-hardening](260701-05-responsive-and-recovery-hardening/spec.md) | Next Workspace Shell | Future responsive behavior and local recovery hardening. |

## Maintenance Rule

When a phase is completed and durable records have moved to the roadmap, project history, briefs, semantic docs, and logic-description docs, remove its dated implementation specs from this directory. Keep only the smallest phase-level archive entry that still helps future readers find the durable owners.
