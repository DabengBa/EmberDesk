# Phase 7 Sprint 4: Extensions Host Full Owner Cutover

Status: planned

## Goal

Make React the full owner for the Extensions Host UI while deciding which extension compatibility surfaces are deleted, frozen, or long-term supported.

## Scope

- Move extension discovery/status presentation, manifest lifecycle orchestration, install/update/delete UI protocol, and mount readiness ownership into React.
- Use Phase 6 evidence before touching Tavern Helper, regex extension, and `@sillytavern/*` compatibility.
- Retire or freeze legacy Extensions Host fallback by ADR.

## Non-Goals

- Do not break third-party extension execution paths without a completed compatibility review.
- Do not delete protected mount points without a replacement or long-term support decision.

## Acceptance

- Extensions Host has one UI runtime owner.
- Compatibility surfaces are explicitly deleted, frozen, or long-term supported.
- Common extension validation passes.

## Validation

```bash
bun run build:react:workspace-panels
bun run test:compat
bun run docs:check
```
