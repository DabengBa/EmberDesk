# ADR-0014: Treat public/script.js as the Workspace Composition Root

- Status: Accepted
- Date: 2026-08-13
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none

## Context

`public/script.js` is the workspace entry and still owns too many roles at once: startup assembly, mutable domain state, React host/bridge code, character/chat/generation implementation, DOM registration, and the public compatibility export surface. This ADR freezes the boundary for incremental extraction; it does not claim that all of those roles leave the file in this wave.

Pre-wave measurements captured before this cutover:

- 17,003 lines
- about 95 imports from `public/scripts/`
- 74 reverse importers of `/script.js`, including one vendored third-party bundle
- about 248 export names
- dozens of direct two-way cycles

The post-implementation static contract currently contains 70 exact first-party reverse-import records. Those records are the compatibility snapshot for the remaining legacy coupling; they are not evidence that reverse imports are zero.

ADR-0012 already requires React to be the sole runtime owner of migrated surfaces and forbids same-version legacy fallbacks. That decision does not by itself stop `public/scripts/**` from importing back into `script.js`. The existing validated seam is `public/scripts/world-info-shell-context.js`: the root registers a narrow context, the domain module does not import `script.js`, missing context fails closed, and event-emitter methods keep their binding.

## Decision

`public/script.js` is the Workspace Composition Root and public compatibility entry. For responsibilities already extracted behind this boundary, it may only:

1. Import and assemble domain modules.
2. Install confirmed public contracts such as `globalThis.SillyTavern`.
3. Re-export approved public names that must remain on the `/script.js` path.
4. Call workspace bootstrap.

The root continues to own not-yet-extracted legacy domain state, DOM handlers, and React bridge coordination. Those owners remain outside this ADR's first cutover and must move only in later, separately verified waves.

Hard constraints:

- First-party `public/scripts/**` modules, excluding vendored `extensions/third-party/**`, must not grow new reverse imports of `script.js`.
- Extracted names have one owner. After this decision's first cutover, first-party modules import `eventSource` / `event_types` from `public/scripts/events.js` and `getRequestHeaders` from `public/scripts/request-context.js`.
- Do not add a universal service locator, `app-state` mega-store, or second global store.
- Each mutable state has one owner. React adapters project state and forward commands; they do not own business rules.
- When an implementation moves out of `script.js`, delete the old body in the same wave. Keep only an explicit re-export or thin adapter when the public path is still required.
- Third-party extensions may keep importing `/script.js` as a public compatibility path until a replacement contract is proven.

## Consequences

- Reverse-import allowlists and name-owner tests become the static gate. The allowlist may only shrink.
- `script.js` remains a live-binding re-export surface for approved public names.
- Later waves can move settings, character session, chat session, generation runtime, React adapters, and DOM controllers without inventing a new composition model.
- Rollback is a previous application version or revert. This version does not keep a second owner.

## Evidence

- `tests/helpers/script-js-reverse-import-contract.js`
- `tests/script-js-composition-root.test.js`
- `tests/world-info-shell-context.test.js`
- `.docs/tech/world-info-shell-context.md`
- `.docs/tech/workspace-composition-root.md`
- `.docs/logic-description/workspace_composition_root_processing_flow.md`
- `public/scripts/events.js`
- `public/scripts/request-context.js`
- `public/scripts/public-api.js`
- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
