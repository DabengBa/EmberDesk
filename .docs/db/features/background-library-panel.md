---
id: feature.background_library_panel
type: feature
name: Retired Background Library Panel
related: [page.chat_workspace]
---

# Retired Feature: Background Library Panel

## ID 解释

`feature.background_library_panel` is the stable semantic record for the former Background Library management surface. It remains in the semantic database so historical links resolve, but it is not a current product entry, panel, or management capability. Its scope ends at the retired library UI and administration behavior; retained background rendering, settings compatibility, and managed-media lifecycle belong to the surrounding workspace and storage contracts.

## Purpose

This record documents the retirement of the former background catalog and management surface. Users no longer open a Background Library panel to browse or administer backgrounds.

## User-Visible Contract

- **Entry:** The workspace has no Backgrounds management entry, drawer, gallery, React panel, legacy panel, or redirect into a library surface.
- **Retained use:** Existing background URLs and visual rendering continue to work, including character/scenario `backgrounds/...` paths, custom background URLs, and the `#bg1` rendering surface.
- **Retained settings:** The established `settings.background` fields continue to load and save. `/bg` remains an independent direct name/path/custom-URL setter and does not require a catalog or gallery.
- **Retained files and media:** `/backgrounds/*`, historical `data/*/backgrounds` files, default background assets, inline chat images, and canonical chat attachments remain readable through their existing compatibility paths; managed-media shadow import remains an internal lifecycle path.
- **Retired administration:** Background CRUD, folder-management HTTP routes and redirects, the legacy drawer/gallery, the React management panel, and management-only commands are no longer available.
- **Feedback:** A user must not see a success-looking library action, an empty replacement panel, or a redirect that suggests background management still exists.

## Semantic Interaction IDs

- `feature.background_library_panel`: the retired Background Library management concept and its preserved compatibility boundary.
- No active primary-entry, refresh, gallery, folder, upload, rename, delete, lock, or auto-background interaction is owned by this retired feature.

## Acceptance Workflows

- As a workspace user who wants to use an existing background, open a chat that already has a background URL; EmberDesk must render it and preserve its settings after reload, and failure is a broken image, dropped `settings.background` field, or a new library prompt.
- As a workspace user who wants to set a background directly, use `/bg` with a name, path, or custom URL; EmberDesk must apply the direct setting without requiring a catalog or gallery, and failure is a catalog request, missing gallery dependency, or stale active metadata.
- As a user looking for background administration, open the current workspace navigation; EmberDesk must show no Backgrounds management entry or drawer and must leave the rest of the chat workspace usable, and failure is any retired CRUD, folder, React, legacy, redirect, or management-command surface being presented as current.

## Feature-Specific Evidence

- The retired entry scan is evidence that management routes, redirects, UI hosts, feature flags, panel state, and management commands are absent; it is not a substitute for the retained rendering/settings contract.
- Preserved-contract evidence covers direct `/bg`, `#bg1`, `settings.background`, `/backgrounds/*`, historical/default assets, inline chat images, canonical chat attachments, and canonical managed-media ownership/tombstone/repair/import behavior.

## Failure Signals

- A Backgrounds navigation entry, drawer, gallery, React host, or legacy management host appears in the current workspace.
- A management API, redirect, folder-management path, or `/lockbg`, `/unlockbg`, or `/autobg` command is registered as a current capability.
- Existing background URLs, settings fields, historical files, inline images, or chat attachments stop working because the library was retired.
- Canonical managed-media owners, tombstones, folder repair/import, or generic media metadata are deleted merely because the library UI was removed.

## Boundaries

- **Removed management boundary:** `/api/backgrounds/*`, background-management redirects, `/api/image-metadata/folders/*`, CRUD/folder management, the legacy drawer/gallery, the React Background Library panel and feature flag, management stores/commands/bridges, and `/lockbg`/`/unlockbg`/`/autobg` are retired.
- **Preserved compatibility boundary:** background URL/render/settings reads, `/backgrounds/*`, historical `data/*/backgrounds`, default assets, canonical managed-media owners, shadow import, tombstones, folder repair/import, inline chat images, canonical chat attachments, thumbnails, and generic image metadata remain outside the retired feature.
- Workspace layout and navigation belong to [Chat Workspace](page.chat_workspace); startup readiness belongs to [Workspace Startup Bootstrap](feature.startup_bootstrap); canonical media lifecycle belongs to the storage architecture docs rather than this semantic feature.
