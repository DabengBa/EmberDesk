---
id: feature.connection_profile
type: feature
name: Connection Profile (Retired)
related: [page.settings, feature.custom_base_url]
---

# Feature: Connection Profile (Retired)

## ID 解释

`feature.connection_profile` previously represented the connection profile system — named snapshots of provider, model, endpoint, key, and preset values, switchable from the retired API Connections drawer. **The connection-manager feature, its drawer UI, the `/profile*` slash commands, and `ConnectionManagerRequestService` have all been removed from EmberDesk.** This Doc ID is retained so historical links and topology remain stable; it is no longer an executable user workflow.

## Purpose

Document the retirement of connection profiles. The single-provider contract (one URL, one API key, one model, one fallback model sharing the same connection) makes multi-connection snapshots unnecessary; the remaining surface is the Providers tab in [Settings](page.settings).

## User-Visible Contract

- There is no connection profile dropdown, no `/profile*` slash command, and no `ConnectionManagerRequestService` on the extension context.
- Stored `feature_settings.connectionManager` data is retained as inert historical data; settings saves preserve it untouched but no product surface reads it.
- The retired `rm_api_block` drawer that hosted the profile controls is deleted entirely.

## Approved Retirement Direction

Delete the connection-manager feature code, slash commands, drawer injection, and request-service API without a feature flag. Rollback is previous-version deploy.

## Semantic Interaction IDs

- `feature.connection_profile` — retired marker only; not a live workflow.

## Feature-Specific Evidence

- The absence of the connection-manager module directory, `/profile*` commands, and profile UI is primary evidence of retirement.

## Failure Signals

- A `/profile*` slash command or profile dropdown reappears.
- Connection code still branches on `connectionProfiles` or a selected profile id.

## Boundaries

- The surviving single-connection fields belong to [Custom Base URL](feature.custom_base_url) and the Providers tab of [Settings](page.settings).
- Provider/model selection belongs to [Chat Completion Provider and Model Select](feature.chat_completion_select).
- Fallback model configuration belongs to [Fallback Provider](feature.fallback_provider).
