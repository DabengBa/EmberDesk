# Legacy Cutover Ledger

## Compatibility Contract Gate

Retirement rows that touch extension, slash, regex, event, selector, or browser-import behavior must pass the provider-neutral contract baseline before deletion:

- manifest: `tests/helpers/frontend-compatibility-contract.js`
- static: `bun run test:compat`
- runtime: `bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js --workers=1`
- internal bridge exclusion: `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand`

Each candidate records current provider, replacement provider, proof command, and deletion readiness. The contract is behavioral; it does not freeze legacy implementation paths forever.


Created: 2026-07-07  
Last reviewed: 2026-07-16

This ledger is the maintainer-facing source of truth for retiring legacy runtime owners from already migrated React surfaces. The 2026-07-07 verdicts below remain the historical baseline; [ADR-0012](../adr/0012-react-migrated-surface-legacy-retirement.md) replaces their former destination-state policy.

This document is not a user-facing feature guide. End-user UI should continue to expose only task-relevant active/status feedback, not governance labels such as `delete`, `freeze-supported`, `compatibility-facade`, or `blocked`.

## Verdict meanings

- `ready`: React already has an independent, behavior-complete implementation; delete only after focused parity proof.
- `foundation`: React has a meaningful UI/state/action base, but still relies on legacy behavior or compatibility implementation that must be replaced.
- `last`: retire only after dependent React surfaces and cross-cutting compatibility contracts are complete.
- `contract`: a supported external behavior that must be reimplemented before the legacy provider disappears.
- `blocked`: still has real consumers, proof is incomplete, or deleting it would break an established contract. Do not treat it as soft debt.
- `compatibility-facade`: the surface stays in place as a routed adapter, bridge, rollback owner, or public entry, but should not grow into a second competing implementation.
- `freeze-supported`: the surface is an explicit long-term compatibility boundary. Internal implementation may evolve, but the documented external contract must not be narrowed casually.
- `delete`: safe to remove only after the listed proof gates pass and no protected consumer remains.

## 2026-07-16 Current Retirement Program

| surface | successor status | why | deletion gate |
|---|---|---|---|
| Login | `retired` | React is the sole runtime owner for `/login`; `/login.html` redirects only | complete; missing build fails closed |
| Setup | `retired` | React is the sole runtime owner for `/setup`; `/setup.html` redirects only | complete; missing build fails closed |
| Character Library | `retired` | React is sole list/row owner; protected selectors come from React DOM; no flag/legacy list fallback | complete |
| Character and Group Authoring | `foundation` | React forms exist, but save completion currently waits for legacy write behavior | React command/service owner with create/edit/delete parity |
| Settings | `foundation` | React route owns only a coverage ledger slice | complete settings coverage and remove workspace-drawer fallback |
| World Info | `foundation` | React workbench is visible owner, but action/prompt/regex/import/delete kernels remain in `world-info.js` | React-owned behavior services plus World Info and regex compatibility proof |
| Background Library | `foundation` | React galleries/actions exist, but file/folder/thumbnail/slash behavior remains legacy-owned | React-owned behavior services and `/lockbg`/`/unlockbg`/`/autobg` parity |
| Extensions Host | `foundation` | React controls exist, but protected mounts and extension lifecycle remain legacy-owned | replacement extension host/protocol and JS-Slash-Runner proof |
| Workspace Shell | `last` | current React chrome coordinates legacy drawers and panels | retire only after its panel owners no longer depend on legacy drawer coordination |
| Main Chat | `last` | React covers selected visible cases; streaming, editing, unsafe rows, load-more, and excluded request families remain legacy-owned | complete provider/row/windowing/extension proof plus interaction performance evidence |
| Globals, events, aliases, selectors, slash/regex contracts | `contract` | power-user extensions and automation use them across all surfaces | explicit supported replacement contracts before any supplying legacy implementation is removed |

## Shell And Navigation

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| Same-entry legacy workspace chrome for `/` | `compatibility-facade` | same-entry React shell chrome for visible outer navigation/status when `features.react.shell.takeover` is enabled | existing legacy workspace chrome on the same route | `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1`; `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js react-state-stores.test.js --runInBand` |  | `.docs/db/features/next-workspace-shell.md`; `.docs/db/pages/chat-workspace.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| Separate-route or full SPA workspace shell cutover | `blocked` | current same-entry `/` shell strategy | legacy `/` workspace shell and current same-entry rollback path | ADR-0007 successor updates; shell/browser proof; extension compatibility proof | current approved strategy explicitly rejects `/workspace-next` and full SPA workspace replacement without a new spec/ADR, migration plan, rollback proof, and compatibility evidence | `.docs/project-overview.md`; `.docs/tech/react-modernization-roadmap.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| AI Config, Formatting, Settings fallback, and Group Chats legacy drawer content under registry-backed shell entries | `compatibility-facade` | same-entry React shell entry registry for visible entry state and open/close/reopen coordination | existing legacy drawer content and route branch | `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1`; `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js --runInBand` |  | `.docs/db/features/next-workspace-shell.md`; `.docs/db/pages/chat-workspace.md`; `.docs/tech/workspace-shell-panel-dock-coordination.md` | 2026-07-07 |

## Authoring

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| Character Authoring visible form surface inside the right drawer | `deleted-or-retired` | React sole-owner character authoring surface with direct `/api/characters` writes | hidden legacy form host for tool popups only; product flag and dual-owner fallback retired | `bun run --cwd tests test:e2e -- character-group-authoring.e2e.js --workers=1`; `bun run --cwd tests test:unit -- character-authoring-facade.test.js group-authoring-facade.test.js react-workspace-panels-helpers.test.js --runInBand` | 2026-07-16 | `.docs/db/pages/chat-workspace.md`; `.docs/db/features/character-library-panel.md`; `.docs/PROJECT_HISTORY.md` | 2026-07-16 |
| Group Authoring visible form surface inside the right drawer | `deleted-or-retired` | React sole-owner group authoring surface with direct `/api/groups` writes | hidden legacy form host only; product flag and dual-owner fallback retired | `bun run --cwd tests test:e2e -- character-group-authoring.e2e.js --workers=1`; `bun run --cwd tests test:unit -- group-authoring-facade.test.js react-workspace-panels-helpers.test.js --runInBand` | 2026-07-16 | `.docs/db/pages/chat-workspace.md`; `.docs/db/features/group-authoring.md`; `.docs/PROJECT_HISTORY.md` | 2026-07-16 |

## Character Library

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| Same-entry Character Library visible toolbar/list/search/sort/bulk path | `retired` | React character-library panel is the sole list/row owner | previous application version deploy (no in-process legacy list fallback) | `bun run test:compat`; `bun run --cwd tests test:unit -- character-list-structure.test.js character-library-react-panel-flag.test.js --runInBand`; `bun run --cwd tests test:e2e -- welcome-screen-character-management.e2e.js --workers=1` |  | `.docs/db/features/character-library-panel.md`; `.docs/db/pages/chat-workspace.md`; `.docs/adr/0012-react-migrated-surface-legacy-retirement.md` | 2026-07-16 |

## World Info

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| World Info visible selector/search/sort/action host | `compatibility-facade` | React World Info host and action surface | `public/scripts/world-info.js` and the established drawer path | `bun run test:compat`; `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js world-info-card-rendering.test.js --runInBand`; `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1` |  | `.docs/db/features/world-info-panel.md`; `.docs/tech/react-modernization-roadmap.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| World Info prompt activation, regex placement, converter/import semantics, and delete-cascade behavior in legacy module form | `freeze-supported` | `public/scripts/world-info.js` compatibility facade | same module and established drawer behavior | `bun run test:compat`; `bun run --cwd tests test:unit -- world-info-shell-context.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js --runInBand` |  | `.docs/db/features/world-info-panel.md`; `.docs/tech/world-info-shell-context.md`; `.docs/tech/third-party-extension-compatibility.md` | 2026-07-07 |

## Backgrounds

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| Background Library visible filter/gallery/action host | `compatibility-facade` | React Background Library host | `public/scripts/backgrounds.js` and the established drawer path | `bun run test:compat`; `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js --runInBand`; `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1` |  | `.docs/db/features/background-library-panel.md`; `.docs/tech/react-modernization-roadmap.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| Background selection, lock/unlock, folder drill-in, upload, thumbnail lifecycle, and slash-compatible background actions | `freeze-supported` | `public/scripts/backgrounds.js` compatibility facade | same module and established drawer behavior | `bun run test:compat`; `bun run --cwd tests test:unit -- background-panel-controller.test.js thumbnail-lazy-image-loading.test.js thumbnail-cache-headers.test.js thumbnail-write-time-pregeneration.test.js --runInBand` |  | `.docs/db/features/background-library-panel.md`; `.docs/tech/third-party-extension-compatibility.md`; `.docs/tech/react-modernization-roadmap.md` | 2026-07-07 |

## Extensions

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| Extensions Host visible notify/manage/install/Extras surface | `compatibility-facade` | React Extensions Host visible surface | `public/scripts/extensions.js` and the established drawer path | `bun run test:compat`; `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js --runInBand`; `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1` |  | `.docs/db/features/extension-panel-open.md`; `.docs/tech/react-modernization-roadmap.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| Protected extension mount points: `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, `#extensionsMenu` | `freeze-supported` | established extension compatibility boundary | same nodes and templates | `bun run test:compat`; `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1` |  | `.docs/tech/third-party-extension-compatibility.md`; `.docs/db/features/extension-panel-open.md` | 2026-07-07 |

## Main Chat

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| Standard OpenAI direct-chat visible transport slice (`submitComposer`, `continueLast`, regenerate/retry, swipe) | `compatibility-facade` | React visible transport owner | legacy `Generate()` / `StreamingProcessor` path | `bun run test:compat`; `bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js --workers=1`; `bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js react-workspace-panels-helpers.test.js --runInBand` |  | `.docs/db/pages/chat-workspace.md`; `.docs/tech/main-chat-generation-lifecycle.md`; `.docs/tech/react-modernization-roadmap.md` | 2026-07-07 |
| Quiet/background helper generation plus non-OpenAI, group, dry-run, and nested-visible transport paths | `blocked` | explicit legacy compatibility owner | same legacy path | `bun run test:compat`; `bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js --workers=1`; `bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js chat-generation-lifecycle.test.js --runInBand` | current proof does not justify deleting the legacy transport owner for these request families; they still carry distinct lifecycle and compatibility behavior | `.docs/db/pages/chat-workspace.md`; `.docs/tech/react-modernization-roadmap.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| Safe finalized rich-body rows, row-lifecycle policy, and reading-position restore | `compatibility-facade` | React row/windowing controller for approved rows and restore policy | legacy formatter snapshot producer and legacy open result on unsafe inputs | `bun run test:compat`; `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js --workers=1`; `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js chat-message-render-descriptor.test.js --runInBand` |  | `.docs/db/pages/chat-workspace.md`; `.docs/tech/main-chat-rendering-call-chain.md`; `.docs/tech/react-modernization-roadmap.md` | 2026-07-07 |
| Editing rows, active streaming rows, extension-mutated rows, structurally unsafe rows, and `showMoreMessages()` execution path | `blocked` | explicit legacy compatibility owner | same legacy path | `bun run test:compat`; `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js --workers=1` | extension mutation, live streaming, and long-chat algorithm proof is not strong enough to retire these legacy owners honestly | `.docs/db/pages/chat-workspace.md`; `.docs/tech/react-modernization-roadmap.md`; `.docs/tech/third-party-extension-compatibility.md` | 2026-07-07 |

## Global Compatibility Exports

| entry | verdict | current owner | rollback owner | evidence gate | blocking reason | durable doc owner | last reviewed |
|---|---|---|---|---|---|---|---|
| `globalThis.SillyTavern` | `freeze-supported` | established public compatibility facade | same object in the current browser shell | `bun run test:compat`; `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand` |  | `.docs/tech/third-party-extension-compatibility.md`; `.docs/project-overview.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| `eventSource` / `event_types` | `freeze-supported` | established public runtime contract | same event emitter and event-name table | `bun run test:compat`; `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js world-info-shell-context.test.js --runInBand` |  | `.docs/tech/third-party-extension-compatibility.md`; `.docs/project-overview.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| `@sillytavern/*` browser import aliases | `freeze-supported` | established browser-module compatibility facade | same alias mapping under `public/` | `bun run test:compat` |  | `.docs/tech/third-party-extension-compatibility.md`; `.docs/db/terms/shared-browser-library.md`; `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md` | 2026-07-07 |
| `__emberDeskReactCompatibilityBridge` as a public replacement API | `blocked` | internal-only first-party bridge | no public fallback because it is not a supported public API | `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand`; `bun run test:compat` | current policy explicitly forbids turning the internal bridge into a third-party replacement API | `.docs/tech/third-party-extension-compatibility.md`; `.docs/project-overview.md` | 2026-07-07 |
