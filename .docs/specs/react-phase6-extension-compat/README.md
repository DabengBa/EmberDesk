# React Phase 6: Extension Compatibility Evidence

Status: planned
Owner doc: [React modernization roadmap](../../tech/react-modernization-roadmap.md)

## Purpose

Phase 6 is an evidence and maintenance phase. It does not delete compatibility surfaces. It prepares the proof Phase 7 needs before deleting, freezing, or long-term supporting extension-facing APIs.

## Scope

- Maintain compatibility exports for at least one deprecation window.
- Validate high-risk extensions and protected surfaces.
- Publish migration guidance and deprecation warnings where needed.
- Feed Phase 7 Sprint 4 and Sprint 7 with evidence.

## Protected Surfaces

- `globalThis.SillyTavern`
- `eventSource` and `event_types`
- `@sillytavern/*` aliases
- Tavern Helper, JS-Slash-Runner, Regex Manager, Quick Reply, Extensions Manager
- Protected extension mount points inside the workspace and extensions drawer

## Exit Evidence Required Before Phase 7

- Common extension validation checklist.
- Migration guide and API change log.
- Deprecation warning period.
- User rollback plan.
- `bun run test:compat` passing record.
- ADR or compatibility review for each breaking change candidate.

## Validation

```powershell
bun run test:compat
bun run docs:check
```
