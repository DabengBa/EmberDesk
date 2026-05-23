---
id: feature.startup_bootstrap
type: feature
name: Workspace Startup Bootstrap
related: [page.chat_workspace, feature.background_library_panel, feature.extension_panel_open]
---

# Feature: Workspace Startup Bootstrap

## ID 解释

`feature.startup_bootstrap` represents the user-visible loading experience from opening EmberDesk's root URL to reaching a usable main shell. It covers visible readiness and follow-up panel loading behavior, not backend startup internals or profiler metrics.

## Feature Purpose

This feature gets the user to a usable workspace as quickly as possible while allowing slower secondary surfaces to finish in the background.

## Trigger Entry

- **Primary entry**: open the EmberDesk root URL in a browser tab.
- **Repeat entry**: reload an existing EmberDesk browser tab.

## Interaction IDs

- `feature.startup_bootstrap`: the full visible startup experience for the main shell.
- `feature.startup_bootstrap.primary_entry`: loading caused by opening or reloading the root workspace.

## User Flow

1. The user opens the root workspace URL.
2. EmberDesk shows a startup overlay while core shell data is prepared.
3. The overlay disappears as soon as the main shell is ready for real interaction.
4. The user can start using the workspace even if secondary surfaces such as backgrounds or extensions are still finishing deferred loading.

## Business Rules And Boundaries

- The main shell must become usable before every secondary surface has finished loading.
- Deferred panel work must not leave the workspace looking permanently blocked.
- Failures in secondary deferred work should surface locally in the affected panel instead of forcing the whole workspace back into a global loading state.

## ID Boundary Notes

This feature stops at the visible browser-side readiness of the workspace. Server boot timing, profiler stages, and transport details belong to tech docs, not to this semantic feature.

## Outcomes

- **Success**: the startup overlay disappears and the workspace becomes usable.
- **Deferred follow-up**: supporting panels keep warming up in the background while the user can already interact with the shell.
- **Partial failure**: the main shell can remain usable while a slower supporting surface exposes its own retry or refresh state.
