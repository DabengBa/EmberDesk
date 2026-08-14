---
id: feature.startup_bootstrap
type: feature
name: Workspace Startup Bootstrap
related: [page.chat_workspace, feature.background_library_panel, feature.extension_panel_open]
---

# Feature: Workspace Startup Bootstrap

## ID 解释

`feature.startup_bootstrap` represents the user-visible loading experience from opening EmberDesk's root URL to reaching a usable main shell. It covers visible readiness and follow-up panel loading behavior, not backend startup internals or profiler metrics.

## Purpose

Bring the user from the root EmberDesk URL to a usable main workspace while slower secondary panels continue loading locally.

## User-Visible Contract

- Opening or reloading the root workspace shows a startup overlay only while core workspace readiness is still required.
- The overlay disappears when the main shell is usable for real interaction, even if secondary surfaces such as backgrounds or extensions are still warming.
- Deferred background or extension failures surface in their own panel areas instead of returning the whole workspace to global loading.
- Compatibility facades used during startup remain available without changing the visible startup experience; the workspace can finish core initialization before secondary compatibility work continues.
- The root workspace remains the long-term runtime facade for `/`; feature-flagged React routes or guarded panel islands may enhance surfaces, but disabled flags or missing bundles must not invalidate the same root shell.
- Same-entry React shell takeover diagnostics may be published during startup after the main shell has a host to attach diagnostic state. Development and CI should treat an enabled but unmountable takeover foundation as a failure, while production safety paths may leave the existing shell visible with a recorded failure reason instead of showing an empty migration host.
- Refreshing the root URL repeats the same visible readiness contract and must not strand the user between shell and panel states.
- The root entry invokes the explicit `bootstrapWorkspace()` composition-root bootstrap. This names the startup contract without implying that all remaining legacy domain and DOM owners have already moved out of `script.js`.

## Semantic Interaction IDs

- `feature.startup_bootstrap`: the full visible startup experience for the main shell.
- `feature.startup_bootstrap.primary_entry`: loading caused by opening or reloading the root workspace.

## Acceptance Workflows

- As a returning workspace user who wants to start chatting, from the root URL open or reload EmberDesk; EmberDesk must show startup feedback only until the main shell can be used, secondary panels may still show local loading, and reload must repeat the same readiness contract. Failure is a blocked core shell or a global loading state that does not clear when the main workspace is ready.
- As a user encountering a secondary panel failure during startup, from the usable workspace open the affected background or extension surface and retry or refresh it locally; EmberDesk must keep the main shell usable and show retry, refresh, or error state locally in that surface, and failure is returning to global loading or leaving a blank panel with no recovery cue.
- As a user on a build with React routes or panel islands disabled or unavailable, from `/` open the workspace; EmberDesk must still present the established root shell and fallback surfaces, refresh must preserve that root entry, and failure is a missing bundle or flag-off state replacing the workspace with an empty migration host.
- As a user on a build where same-entry React shell takeover diagnostics are enabled, from `/` open the workspace; EmberDesk must keep the existing workspace visible until later shell takeover stages actually change layout, development and CI must fail when required takeover conditions are missing, and production safety fallback must record a reason rather than silently masking the problem.
- As a user opening the root workspace with World Info or other compatibility-dependent surfaces available, EmberDesk must finish main-shell initialization and remove the startup overlay before secondary panel work continues; failure is a compatibility initialization error that leaves the user stuck on global `Initializing...` feedback.

## Feature-Specific Evidence

- Startup overlay disappearance, usable workspace controls, and local panel loading/error states are primary evidence.
- Performance timings and profiler stages are supporting evidence only after the visible readiness contract is satisfied.
- React bundle availability and feature flags are migration evidence, not alternate user-visible contracts.

## Failure Signals

- The global startup overlay remains after the main shell could otherwise be used.
- A background or extension load failure blocks the whole workspace.
- Refreshing the root URL leaves the user between a hidden overlay and unusable shell.
- A compatibility surface fails during core initialization and blocks the shell from reaching ready.
- Flag-off or bundle-missing React paths produce an empty workspace instead of the established shell.
- Enabled shell takeover diagnostics fail silently in development or CI instead of exposing the missing host, invalid payload, or mount failure reason.

## Boundaries

- Background panel loading and refresh behavior belongs to [Background Library Panel](feature.background_library_panel).
- Extension surface loading and retry behavior belongs to [Extensions Panel Open](feature.extension_panel_open).
- The workspace layout and navigation surface belong to [Chat Workspace](page.chat_workspace).
- Server startup phases, profiler metrics, and transport internals belong to tech docs, not this semantic feature.
