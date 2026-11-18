---
id: feature.startup_bootstrap
type: feature
name: Workspace Startup Bootstrap
related: [page.chat_workspace]
---

# Feature: Workspace Startup Bootstrap

## ID 解释

`feature.startup_bootstrap` represents the user-visible loading experience from opening EmberDesk's root URL to reaching a usable main shell. It covers visible readiness and follow-up panel loading behavior, not backend startup internals or profiler metrics.

## Purpose

Bring the user from the root EmberDesk URL to a usable main workspace while slower secondary panels continue loading locally.

## User-Visible Contract

- Opening or reloading the root workspace shows a startup overlay only while core workspace readiness is still required.
- The overlay disappears when the main shell is usable for real interaction, even if secondary surfaces such as world info are still warming. Active chat background application is chat context, not a background-library panel.
- Deferred panel failures surface in their own areas instead of returning the whole workspace to global loading.
- Compatibility facades used during startup remain available without changing the visible startup experience; the workspace can finish core initialization before secondary compatibility work continues.
- `/` opens the authenticated workspace in the same React application as login, setup, and settings. There is no second workspace UI to fall back to.
- Refreshing the root URL repeats the same visible readiness contract and must not strand the user between shell and panel states.
- The root entry invokes the explicit `bootstrapWorkspace()` composition-root bootstrap. This names the startup contract without implying that all remaining legacy domain and DOM owners have already moved out of `script.js`.

## Semantic Interaction IDs

- `feature.startup_bootstrap`: the full visible startup experience for the main shell.
- `feature.startup_bootstrap.primary_entry`: loading caused by opening or reloading the root workspace.

## Acceptance Workflows

- As a returning workspace user who wants to start chatting, from the root URL open or reload EmberDesk; EmberDesk must show startup feedback only until the main shell can be used, secondary panels may still show local loading, and reload must repeat the same readiness contract. Failure is a blocked core shell or a global loading state that does not clear when the main workspace is ready.
- As a user encountering a secondary surface failure during startup, from the usable workspace open the affected panel surface or apply an active chat background; EmberDesk must keep the main shell usable and show local retry, refresh, or error behavior, and failure is returning to global loading or leaving a blank surface with no recovery cue.
- As a user opening the root workspace with World Info or other compatibility-dependent surfaces available, EmberDesk must finish main-shell initialization and remove the startup overlay before secondary panel work continues; failure is a compatibility initialization error that leaves the user stuck on global `Initializing...` feedback.

## Feature-Specific Evidence

- Startup overlay disappearance, usable workspace controls, and local panel loading/error states are primary evidence.
- Performance timings and profiler stages are supporting evidence only after the visible readiness contract is satisfied.

## Failure Signals

- The global startup overlay remains after the main shell could otherwise be used.
- A retained active-background application failure blocks the whole workspace.
- A secondary panel load failure blocks the whole workspace.
- Refreshing the root URL leaves the user between a hidden overlay and unusable shell.
- A compatibility surface fails during core initialization and blocks the shell from reaching ready.

## Boundaries

- Active chat background application and its metadata belong to [Chat Workspace](page.chat_workspace).

- The workspace layout and navigation surface belong to [Chat Workspace](page.chat_workspace).
- Server startup phases, profiler metrics, and transport internals belong to tech docs, not this semantic feature.
