---
id: feature.startup_bootstrap
type: feature
name: Workspace Startup Bootstrap
related: [page.chat_workspace]
---

# Feature: Workspace Startup Bootstrap

## ID 解释

`feature.startup_bootstrap` represents the user-visible loading experience from opening EmberDesk's root URL to reaching a usable main shell. It covers visible readiness and follow-up panel loading behavior, not startup internals or performance metrics.

## Purpose

Bring the user from the root EmberDesk URL to a usable main workspace while slower secondary panels continue loading locally.

## User-Visible Contract

- Opening or reloading the root workspace shows the chat layout with local placeholders, not a full-screen splash. The composer cannot be used while the workspace is being prepared.
- The placeholders clear when the main workspace is usable, even if secondary panels are still loading. If the workspace cannot start, the chat area shows an error and a reload action instead of remaining in a loading state.
- Deferred panel failures surface in their own areas instead of returning the whole workspace to global loading.
- The root opens the authenticated workspace in the same application as login, setup, and settings. There is no second workspace UI to fall back to.
- Refreshing the root URL repeats the same visible readiness contract and must not strand the user between shell and panel states.

## Semantic Interaction IDs

- `feature.startup_bootstrap`: the full visible startup experience for the main shell.
- `feature.startup_bootstrap.primary_entry`: loading caused by opening or reloading the root workspace.

## Acceptance Workflows

- As a returning workspace user, open or reload the root URL; EmberDesk must show startup feedback only until the main shell can be used, secondary panels may still show local loading, and reload must repeat the same readiness contract. Failure is a blocked core shell or a global loading state that does not clear when the main workspace is ready.
- As a user encountering a secondary surface failure during startup, open the affected panel or apply an active chat background from the usable workspace; EmberDesk must keep the main shell usable and show local retry, refresh, or error behavior. Failure is returning to global loading or leaving a blank surface with no recovery cue.

## Failure Signals

- The workspace is covered by a full-screen splash or allows sending before it is ready.
- A retained active-background failure blocks the whole workspace.
- A secondary panel load failure blocks the whole workspace.
- A failed startup leaves a permanent placeholder with no reload action.

## Boundaries

- Active chat background application and its metadata belong to [Chat Workspace](page.chat_workspace).
- The workspace layout and navigation surface belong to [Chat Workspace](page.chat_workspace).
