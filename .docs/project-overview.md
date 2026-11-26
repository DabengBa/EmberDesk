# EmberDesk Project Overview

## Positioning

EmberDesk is a browser-based, self-hosted LLM frontend derived from SillyTavern. Its narrower goal is to keep the power-user workflow, remove unnecessary complexity, improve real-world responsiveness, and modernize incrementally while preserving daily usability for existing users.

It is not a hosted service, a new frontend framework, or a clean-room rewrite.

## Audience

EmberDesk targets self-hosting users on local machines, NAS, VPS or Docker-based servers; power users with large character libraries, chats and world info; and users who access the same server from desktop and mobile browsers. It is not optimized for a managed cloud product or a minimal one-click chat toy.

## Principles

1. Simplify before extending.
2. Prefer observable gains over architectural novelty; solve confirmed failures instead of adding speculative defensive complexity.
3. Keep canonical user data portable and recoverable. The accepted storage direction and its rejected alternatives are in [canonical SQLite authority](adr/0001-canonical-sqlite-authority.md).
4. Modernize in slices that preserve existing behavior and upgrade safety.
5. Treat documentation and measurement as part of product quality, not afterthoughts.

## Explicit exclusions

- Replacing the workspace with a separate full SPA route or introducing a second runtime owner for a migrated surface.
- Replacing all user-data files in one move, or treating derived caches, projections and exports as authority.
- Providing a hosted SaaS control plane.
- Treating every upstream SillyTavern feature as mandatory to preserve forever.

## Guardrails for future work

- Prefer deletion, narrowing or derived-state acceleration before adding new core systems.
- Keep migrations incremental and reversible where practical; keep rollback as a previous application version or revert.
- Separate user-visible product semantics from implementation notes.
- Validate performance claims with repeatable tooling and browser evidence.
- Keep maintainer governance state out of end-user UI; users see task-relevant status, not internal cutover labels.
- One fact has one owner: update `.docs/db/`, `.docs/tech/` or `.docs/adr/` rather than restating it here.
