# ADR-0012: Retire Legacy Runtime Owners From Migrated React Surfaces

- Status: Accepted
- Date: 2026-07-16
- Deciders: EmberDesk product and maintainers
- Supersedes: the fallback-retention portions of ADR-0007 and the 2026-07-07 Legacy Cutover Ledger
- Superseded by: none

## Context

ADR-0007 deliberately used guarded React islands with legacy same-entry fallbacks. That reduced the risk of the first migration steps, but it left duplicated runtime owners, hidden DOM hosts, feature-flag branches, and legacy action facades inside surfaces that users already experience as React.

The product decision on 2026-07-16 changes the destination, not the current code fact:

- every currently migrated React surface must eventually have React as its only runtime implementation;
- users must retain the same entry points, key workflows, results, and supported extension or automation behavior;
- compatibility is a behavioral contract, not permission to retain the old jQuery implementation indefinitely;
- the work does not authorize a separate `/workspace-next` route, a broad SPA rewrite of non-migrated surfaces, or an unrelated interaction redesign.

## Decision

Adopt a staged legacy-retirement program for the already migrated React surfaces:

1. `/login`, `/setup`, and `/settings`;
2. Character Library plus Character and Group Authoring;
3. World Info, Background Library, and Extensions Host;
4. the same-entry workspace shell and guarded main-chat island.

For a surface to complete the program:

- the React implementation is the sole runtime owner for its user-visible behavior and internal action flow;
- flag-off, build-missing, mount-failure, hidden-DOM, and legacy-owner fallbacks for that surface are removed rather than retained as product rollback paths;
- the established user workflow and result remain behaviorally equivalent;
- supported extension, slash-command, regex, event, selector, and browser-import contracts continue to work through a deliberately maintained replacement contract;
- release rollback is performed by deploying a prior application version, not by keeping the old implementation alive inside the new version.

The root workspace remains the current `/` entry. This decision does not require a separate SPA route and does not claim React ownership of a surface that has not already entered the React migration program.

## Rationale

1. A visible React shell backed by legacy behavior owners makes ownership, debugging, performance work, and deletion accountability ambiguous.
2. Product parity is more valuable than a fast cosmetic cleanup: unported behavior must move into the React-owned implementation before the legacy code is removed.
3. EmberDesk's power-user audience relies on established extensions and automation. Those contracts can be reimplemented, versioned, and tested without preserving the old UI/runtime architecture.
4. A normal version rollback is a clearer operational safety boundary than a permanent in-process dual implementation.

## Consequences

Positive:

- Each migrated surface has one accountable runtime owner after completion.
- Legacy DOM bridges, feature flags, and duplicate control paths have an explicit deletion destination.
- Extension compatibility becomes a tested external contract rather than an accidental side effect of retained jQuery code.

Negative:

- Several guarded islands are not deletion-ready; they require functional migration work before cleanup.
- Main-chat and workspace-shell retirement require broad compatibility, performance, and browser proof.
- Supported extension behavior must receive replacement seams before protected legacy nodes or globals can disappear.

Neutral clarifications:

- Existing compatibility behavior remains required until its replacement is proven; this ADR does not silently break extensions.
- API payload, user-data, security, and file-backed storage contracts remain governed by their existing owners.
- Current fallback behavior remains a code fact until each row in the retirement ledger passes its proof gates.

## Rollout Requirements

The [React Legacy Retirement Brief](../tech/briefs/260716-02-react-legacy-retirement.md) and [Legacy Cutover Ledger](../tech/legacy-cutover-ledger.md) own sequencing and evidence.

At minimum, each deletion must show:

- semantic workflow parity for the affected page or feature;
- focused unit and Playwright proof, plus `pnpm run test:compat` where extension-facing behavior is involved;
- no remaining runtime import, feature flag, hidden host, or fallback branch that activates the deleted owner;
- preserved supported public contracts, including stable extension selectors or their documented replacement;
- startup and interaction evidence where the surface touches workspace startup, large lists, or main chat;
- updated `.docs/db` behavior documentation and project history.

## React Runtime Boundary Addendum (2026-08-14)

The main-chat retirement work now has an explicit internal boundary named **React Runtime Boundary**:

- `app/` does not read `globalThis.SillyTavern`, `eventSource`, `event_types`, or `getContext()`. Internal React code receives typed runtime snapshots and named command ports from `app/compat/runtime-port.ts` and `app/compat/workspace-commands.ts`.
- `app/stores/main-chat-store.ts` owns immutable message records, ordering, visible-window state, composer snapshot shape, generation state, streaming state, and slash snapshot shape. `public/scripts/main-chat-store-projection.js` is the framework-neutral projection from stored chat data to that shape; it does not scan message DOM or accept DOM HTML snapshots.
- React mounts message rows directly under `#chat` and emits the protected `.mes[mesid]`, `.mes_text`, reasoning/media/file/action shells as output. Legacy message nodes are not an input source for React state.
- `globalThis.SillyTavern`, `eventSource`, `event_types`, stable selectors, and `@sillytavern/*` remain public compatibility contracts. They are not an internal React state API and are not removed by this boundary decision.
- Generic `dispatchAction(string, payload)` is removed from the React surface boundary. Commands are named by surface and operation, so a command cannot silently acquire another surface's authority.

This addendum records a delivered boundary, not a claim that every main-chat owner has already moved. The remaining owner split is deliberate and must stay explicit:

| Concern | Current owner | Boundary status |
|---|---|---|
| Message records, React rows, rich-body projection, ordering, windowing, and reading-position restore | React main-chat store and `MessageRow` output | Delivered |
| Message edit/copy/delete/move, reasoning expand/copy/edit/delete/collapse, and visible generation command entry points | Named React commands backed by framework-neutral persistence and generation services | Delivered command boundary; public compatibility handlers remain |
| Composer input value and legacy composer DOM controls | Existing `#send_textarea` / `#send_but` controls | Command capture delivered; store write-owner replacement is still required |
| Provider transport, token append, slash parser/registry/executor, and reasoning parse/template/stream internals | Framework-neutral legacy modules behind public compatibility contracts | Not a React owner claim |
| Third-party extension mutation zones and public globals/events | Freeze-supported compatibility contracts | Must remain stable until replacement proof exists |

The final completion gate for this topic is therefore not a zero-count global search. It is a runtime proof that a message-state update with no pre-existing legacy message rows still renders, operates, persists, and emits the supported compatibility DOM from the React store. Composer write ownership and the remaining command/extension control surfaces must be proven separately before this addendum can be marked complete.

## Evidence

- [ADR-0007: React Page And Panel Islands With Legacy Fallbacks](0007-react-page-islands-with-legacy-fallbacks.md)
- [React Modernization Roadmap](../tech/react-modernization-roadmap.md)
- [Legacy Cutover Ledger](../tech/legacy-cutover-ledger.md)
- [React Legacy Retirement Brief](../tech/briefs/260716-02-react-legacy-retirement.md)
- [Third-Party Extension Compatibility](../tech/third-party-extension-compatibility.md)
- [Chat Workspace](../db/pages/chat-workspace.md)
