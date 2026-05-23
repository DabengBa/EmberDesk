# Frontend jQuery Slice Migration

## Goal

Begin moving frontend code away from broad jQuery/global-script organization through small production-ready slices. Each slice must ship independently, preserve the current UI workflow, and reduce future coupling without introducing a SPA framework.

## Production-Ready Result

This task is shippable when one selected low-risk frontend area has clearer module boundaries, narrower DOM ownership, focused tests, and unchanged user behavior. The work should establish a repeatable migration pattern rather than attempting a whole-frontend rewrite.

## Source Evidence

- `public/` contains HTML, CSS, ES modules, and jQuery-style scripts.
- `public/scripts/` includes high-traffic modules for login, setup, chat, extensions, world info, settings, and startup.
- `AGENTS.md` forbids introducing React, Vue, or other SPA frameworks without explicit approval.
- Existing semantic docs in `.docs/db/` describe user-facing pages and features such as login, setup, chat workspace, startup bootstrap, extension panel, background library, character library, and API configuration.
- Playwright E2E tests already cover core login/setup/sample flows and can be extended per migrated slice.

## Scope

In scope:

- Select one slice with clear ownership, for example login form behavior, setup page behavior, a library panel, or a small settings panel.
- Move that slice toward explicit module state, event binding functions, and DOM query ownership.
- Keep jQuery available where the surrounding code still expects it.
- Add focused unit tests for pure logic and Playwright coverage for the user path.
- Update semantic docs only if visible workflow behavior changes.

Out of scope:

- Whole-app frontend rewrite.
- SPA framework introduction.
- Build-system replacement.
- Unrelated visual redesign.
- Removing global compatibility used by extensions.

## Implementation Plan

1. Pick a migration slice based on low blast radius, existing tests, and clear user-facing acceptance.
2. Write or update a failing test for the current desired behavior before refactoring the slice.
3. Extract pure decision logic from DOM handlers where practical.
4. Replace broad global event binding with a narrow initializer that owns one DOM root.
5. Keep public events and selectors stable unless the slice explicitly owns their migration.
6. Run focused unit tests.
7. Run Playwright for the affected page or panel plus the general smoke path.
8. Record the migration pattern in a short tech note if it will guide later slices.

## Acceptance Criteria

- One frontend slice has clearer module ownership and no behavior regression.
- Existing keyboard, click, validation, loading, and error states in that slice still work.
- Tests cover the changed behavior.
- The main shell still loads and the selected user path passes in a browser.
- No SPA framework, TypeScript application migration, or build replacement is introduced.

## Rollback

Revert the single slice migration commit. Since slices are intentionally independent, rollback must not require reverting Node or Express upgrade work.

## Risks And Boundaries

- Hidden extension or template dependencies may read selectors directly. Preserve stable selectors unless the migration explicitly documents a replacement.
- jQuery removal is not the goal of one slice; the goal is clearer ownership and less global coupling.
- Visual changes require separate design review unless they are unavoidable to preserve behavior.

