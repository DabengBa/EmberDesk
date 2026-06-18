# ADR-0007: Use React page and panel islands with legacy fallbacks for early migration

Status: accepted

EmberDesk's main workspace still exposes jQuery-era compatibility surfaces for extensions, slash commands, shared globals, and file-backed settings flows, while early React migration now needs both lower-risk standalone routes and the first workspace-side panel slice. The decision is to ship `/login`, `/setup`, and `/settings` as feature-flagged React page islands, and to ship early workspace slices such as the character library as guarded React panel islands behind the existing workspace entry points, reusing the shared React build and keeping `/login.html`, `/setup.html`, legacy `/` workspace behavior, and legacy panel fallbacks until each surface is safe to retire.

Alternatives considered were a full SPA cutover and a purely embedded React-in-jQuery drawer migration. A full SPA cutover would force high-risk workspace and extension compatibility changes into the first React slice; embedded drawers would hide the intended route/panel boundaries and make rollback harder to reason about.

Consequences:

- React page routes must have explicit feature flags and build-missing fallbacks.
- Early React workspace panels must keep the same user entry point and preserve legacy panel fallback behavior when the flag is off or the build is unavailable.
- Early React pages must preserve existing API contracts, visible copy, and redirect outcomes.
- TanStack Form, Zod, and TanStack Query are the default adoption gate for React page/panel forms and server state unless a later spec or ADR records an exception and exit plan; virtualization is expected for large-list panel slices when DOM pressure is part of the migration goal.
- Legacy surfaces remain valid rollback and compatibility owners until a later cleanup spec removes them with focused proof.
- User-facing page semantics stay in `.docs/db`; this ADR only records the migration boundary decision.
