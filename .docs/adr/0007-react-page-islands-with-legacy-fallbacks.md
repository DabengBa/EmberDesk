# ADR-0007: Use React page and panel islands with legacy fallbacks for early migration

Status: accepted

EmberDesk's main workspace still exposes jQuery-era compatibility surfaces for extensions, slash commands, shared globals, and file-backed settings flows, while early React migration now needs both lower-risk standalone routes and the first workspace-side panel slice. The decision is to ship `/login`, `/setup`, and `/settings` as feature-flagged React page islands, and to ship early workspace slices such as the character library as guarded React panel islands behind the existing workspace entry points, reusing the shared React build and keeping `/login.html`, `/setup.html`, legacy `/` workspace behavior, and legacy panel fallbacks until each surface is safe to retire.

Alternatives considered were a full SPA cutover and a purely embedded React-in-jQuery drawer migration. A full SPA cutover would force high-risk workspace and extension compatibility changes into the first React slice; embedded drawers would hide the intended route/panel boundaries and make rollback harder to reason about.

Consequences:

- React page routes must have explicit feature flags and build-missing fallbacks.
- Early React workspace panels must keep the same user entry point and preserve legacy panel fallback behavior when the flag is off or the build is unavailable.
- Workspace panel mount wrappers must check their feature flag before creating independent React hosts. A disabled panel flag should leave the legacy panel DOM without an empty migration host, while build/import failures must leave protected legacy nodes in place and keep the legacy behavior owner active.
- The same fail-closed rule extends to later main-chat visible-owner, Zustand observation-store, and compatibility-bridge slices: new React ownership may narrow a safe sub-surface, but excluded requests, unsafe rows, or build-missing paths stay on the legacy owner until a later cutover spec and ADR retire them.
- Early React pages must preserve existing API contracts, visible copy, and redirect outcomes.
- TanStack Form, Zod, and TanStack Query are the default adoption gate for React page/panel forms and server state unless a later spec or ADR records an exception and exit plan; virtualization is expected for large-list panel slices when DOM pressure is part of the migration goal.
- React islands may carry legacy-owned controls or state when that preserves product semantics and extension compatibility; the owning spec or tech doc must state that boundary instead of implying React has taken over the legacy subsystem.
- Future panel flags, host bundles, or bridge helpers may be scaffolded before the user-facing migration is complete, but the surface remains legacy-owned until the panel-specific activation bridge, fallback, and compatibility proof are implemented.
- Legacy surfaces remain valid rollback and compatibility owners until a later cleanup spec removes them with focused proof.
- User-facing page semantics stay in `.docs/db`; this ADR only records the migration boundary decision.

2026-06-23 Phase 7 Sprint 1 update:

- Character Library has advanced past the original guarded-island baseline: the normal runtime owner for visible toolbar/list/search/sort/bulk browsing state is now the React panel path on the existing workspace entry.
- The flag-off or bundle-import-failure path remains allowed only as a documented emergency compatibility facade and rollback owner from the same entry. It is no longer treated as a co-equal long-term behavior owner for normal operation.
- While the legacy `characters` array still survives as a compatibility projection for first-party and extension-adjacent call sites, late `/api/characters/all` snapshots must be projected against already-deleted avatars so delete-completed cards do not reappear in the visible library before the server snapshot catches up.

2026-06-23 Phase 7 Sprint 2 update:

- World Info has advanced past the original action-island baseline: the visible React owner path no longer dispatches world selection, search/sort, create/open entry, import/export, refresh, rename, duplicate, or delete through raw DOM `.click()` / `.trigger()` calls in `public/script.js`.
- Those actions now route through explicit helpers in `public/scripts/world-info.js`, making that module the single compatibility facade for high-risk World Info behavior while prompt activation, regex placement, converter/import semantics, and delete-cascade rules stay preserved.
- The flag-off or bundle-import-failure path still remains the documented emergency compatibility facade and rollback owner from the same workspace entry; React does not become a second implementation of the underlying World Info prompt/regex/delete semantics.

2026-06-23 Phase 7 Sprint 3 update:

- Background Library has advanced past the original action-island baseline: the visible React owner path no longer dispatches selection, lock/unlock, or auto-background behavior through raw DOM `.click()` calls in `public/script.js`, and the host now resamples bridge state after each React-dispatched action settles.
- Those actions now route through explicit helpers in `public/scripts/backgrounds.js`, making that module the single compatibility facade for high-risk Background Library behavior while folder drill-in state, selection and lock side effects, thumbnail/lazy-load lifecycle, and `/lockbg` / `/unlockbg` / `/autobg` semantics stay preserved.
- The flag-off or bundle-import-failure path still remains the documented emergency compatibility facade and rollback owner from the same workspace entry; React does not become a second implementation of background file, folder, thumbnail, or slash behavior.

2026-06-23 Phase 7 Sprint 4 update:

- Extensions Host has advanced past the original action-island baseline: the visible React owner path no longer dispatches notify/manage/install/connect/autoconnect behavior through raw DOM `.click()` or `.trigger()` calls in `public/script.js`.
- Those actions now route through explicit helpers in `public/scripts/extensions.js`, making that module the compatibility facade for deferred loader, install/manage orchestration, Extras connection state, and host-state synchronization while protected mount points remain frozen compatibility nodes rather than React-owned replacements.
- The flag-off or bundle-import-failure path still remains the documented emergency compatibility facade and rollback owner from the same workspace entry; React does not become a second implementation of protected mount-point lifecycle, third-party extension mounting, regex host semantics, or `@sillytavern/*` compatibility.

2026-06-23 Phase 7 Sprint 5 update:

- Main-chat visible transport has not widened beyond the standard OpenAI direct-chat slice: `submitComposer`, `continueLast`, `retryGeneration`, `swipeLeft`, and `swipeRight` remain the only supported React-owned visible transport requests.
- Non-OpenAI, group, dry-run, nested-visible, quiet, and background transport paths stay ADR-frozen on the legacy owner. This sprint does not promote them into a partial React transport runtime without full provider/lifecycle proof.
- The hidden main-chat controller now publishes the attempted visible transport decision (`owner`, `kind`, `status`, `path`, `reason`) so excluded compat paths remain auditable and diagnosable instead of collapsing into an untyped generic fallback.

2026-06-23 Phase 7 Sprint 5 quiet/background update:

- Quiet/background helper generation remains explicitly outside the React-owned visible transport slice even after the visible compat-path freeze work. It is not a downgraded visible fallback; it is a separate legacy-owned non-visible helper contract.
- `generateQuietPrompt()` now records that helper contract through dedicated hidden controller markers (`data-main-chat-quiet-transport-*`) so request family, phase, no-auto-recovery, no-visible-row, return-string finalization, and caller-owned rollback remain auditable without implying React row ownership.
- Background auto-selection (`/autobg`) now opts into that same explicit background helper family through `public/scripts/backgrounds.js`, keeping slash-command compatibility and rollback on the existing background facade instead of forking a second runtime path.
- Main-chat row lifecycle and long-chat windowing follow the same explicit-owner rule: the React message-list controller owns the lifecycle/windowing policy and reading-position restore, while excluded row families and the actual `showMoreMessages()` execution path stay on documented legacy facades until a later spec proves a wider cutover.

2026-06-23 Phase 7 Sprint 6 update:

- Main-chat rich-body ownership has advanced past the earlier owner-marker-only baseline: safe finalized rows with protected `.mes_text`, reasoning, media, file, and bias shells can now use React as the final visible rich-body owner.
- React does not become a second Markdown, code, LaTeX, media, or file renderer. The legacy formatter path remains the snapshot producer and compatibility fallback, while React replays the validated rich-body HTML back into the protected legacy DOM shells for the approved row family.
- Editing rows, active streaming rows, structurally unsafe rows, missing-`.mes_text` rows, and extension-mutated rows such as `.mes_streaming`, `.TH-streaming`, or `.TH-render` stay on explicit legacy facades. This keeps `JS-Slash-Runner` and similar extension mutations fail-closed until a later spec proves a wider safe boundary.
- Long-chat load-more stays on the explicit `legacy-show-more-messages-facade`, while reading-position restore and the single windowing policy owner stay on the React message-list controller. Hidden controller markers now publish that split directly for diagnostics and compatibility tests.

2026-06-24 Phase 7 Sprint 7 final decision:

- EmberDesk did not move to a full SPA workspace shell in the Phase 7 closeout. At that point, the existing jQuery workspace shell was frozen as the runtime facade for `/`, while React pages, guarded panel islands, and the guarded main-chat island remained additive owners inside that shell.
- Flag-off, build-missing, and bundle-import-failure paths no longer count as vague temporary debt for the root workspace shell. They are explicit rollback behavior on the same workspace facade and must stay documented and test-covered.
- `globalThis.SillyTavern` remains a frozen public compatibility facade, `eventSource` / `event_types` remain long-term supported public runtime contracts, and `@sillytavern/*` remains a frozen documented browser-module facade for existing extension ecosystems such as `JS-Slash-Runner`.
- The shared `/lib.js` browser library remains the preferred long-term utility surface for new ES-module extensions, while `__emberDeskReactCompatibilityBridge` remains internal-only and cannot become a public escape hatch or replacement API.

2026-07-01 Next Workspace Shell successor update:

- The "no full SPA workspace shell" decision remains in force for separate-route or whole-app cutover proposals: EmberDesk still does not introduce `/workspace-next`, does not replace the file-backed model, and does not retire extension/slash/event compatibility surfaces as part of shell modernization.
- The workspace shell boundary has been explicitly reopened as a same-entry successor path for the current `/` route. `features.react.shell.takeover` may mount a React-owned outer chrome and main-chat layout/status shell while keeping drawer contents, protected message rows, extension mount points, and legacy rollback available on the same entry.
- The bootstrap payload now includes `reactPages.settings`, independent workspace panel flags, and `reactShell.{takeover,strict}`. Strict takeover failures are limited to CI, explicit development, and explicit test environments; self-hosted starts with `NODE_ENV` unset keep the production safety fallback semantics.
- React workspace chrome may hide legacy primary toggles only after equivalent role/name entries exist in the React chrome. AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, and Settings now have React chrome entries; Settings routes to `/settings` only when the React Settings page is enabled and otherwise opens the existing User Settings drawer.

2026-07-05 Panel dock coordination update:

- The same-entry React workspace chrome now coordinates Character Library, World Info, Backgrounds, and Extensions through a transient dock snapshot owned by `app/stores/workspace-panel-store.js`, with visible chrome actions still routed through the legacy drawer and facade owners in `public/script.js`.
- The shell records an optimistic `loading` intent before each panel action and then normalizes the settled result to `disabled`, `loading`, `empty`, `success`, or `error` without creating a second owner for World Info, Background, Extensions, or character-library behavior.
- Current drawer `pinnedOpen` facts are copied into transient `locked` / `pinned` metadata for compatibility snapshots and focused proof, but the visible shell chrome only shows active-panel and dock-status feedback; it does not render separate pinned/locked badges.
- `__emberDeskReactCompatibilityBridge` may expose the sanitized `workspacePanelDock` snapshot for internal diagnostics and migration proof, but it remains internal-only and does not replace the documented public compatibility surfaces.

2026-07-06 Workspace panel owner registry update:

- The same-entry React workspace chrome now treats AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring as registry-backed panel entries. This widens the control plane without claiming that every panel's content has already moved to React.
- Same-entry toggle semantics are part of the boundary: clicking the active entry asks the legacy owner to close and only clears active shell state after the close result arrives. Pinned or locked drawers keep the shell entry active because the user-visible content remains open.
- The registry keeps owner/fallback coordination in `app/workspace-panels.tsx`, `app/stores/workspace-panel-store.js`, and `public/script.js`; panel-specific semantics, protected DOM, public compatibility exports, and later content replacement remain governed by their own specs and docs.

2026-07-06 Browser walkthrough hardening update:

- The same-entry shell now treats first-open panel safety as part of the boundary contract: shell-driven panel actions wait one macrotask before entering legacy drawer listeners, and World Info preloads its deferred `world-info-body` panel before the drawer opens so first-click shell opens do not freeze the visible workspace.
- Character Library query synchronization now treats one React Query snapshot timestamp as one bridge-sync budget; repeated renders of the same `charactersDataUpdatedAt` must not loop the same payload back through the legacy character-library bridge.
- Visible shell and panel badges now use short human-readable phrases while raw enums remain in diagnostics. The migration boundary keeps internal state vocabulary out of the default user path instead of normalizing the shell around implementation terms.
