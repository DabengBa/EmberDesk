# React Development Specs

This directory only keeps active or future development specs.

Completed Phase 0, Phase 1, Phase 2, Phase 3, and Phase 3B implementation specs have been removed from this active workspace. Durable completion records live in:

- [React modernization roadmap](../tech/react-modernization-roadmap.md)
- [Project history](../PROJECT_HISTORY.md)
- [User intent briefs](../tech/briefs/README.md)
- Owning semantic docs under `../db/`
- Logic-description docs under `../logic-description/`

## Active Spec Folders

| Folder | Roadmap phase | Purpose |
|---|---|---|
| [react-phase4-state-management](react-phase4-state-management/README.md) | Phase 4 / 4A / 4B | Zustand/global bridge, extension migration guidance, main-chat transport and renderer extraction evidence. |
| [react-phase5-backend-api](react-phase5-backend-api/README.md) | Phase 5 | Typed API modernization, Hono route shell proof, Drizzle derived-cache boundary, Express sunset gate. |
| [react-phase6-extension-compat](react-phase6-extension-compat/README.md) | Phase 6 | Extension compatibility evidence before any breaking cutover decision. |
| [react-phase7-full-owner-cutover](react-phase7-full-owner-cutover/README.md) | Phase 7 | Full owner cutover and legacy fallback retirement, split by migrated surface. |

## Maintenance Rule

When a phase is completed and durable records have moved to the roadmap, project history, briefs, semantic docs, and logic-description docs, remove its implementation specs from this directory. Do not keep completed process specs as active delivery inputs.
