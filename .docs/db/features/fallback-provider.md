---
id: feature.fallback_provider
type: feature
name: Fallback Provider (后台模型)
related: [page.settings, feature.custom_base_url, feature.chat_completion_select, feature.chat_memory]
---

# Feature: Fallback Provider

## ID 解释

`feature.fallback_provider` describes the optional 后台模型 field that lets a second model answer foreground [Chat Generation](feature.chat_generation_auto_recovery) and [Chat Memory](feature.chat_memory) work when the primary model fails. It is configured in [Settings](page.settings) alongside the one endpoint and credential used by [Custom Base URL](feature.custom_base_url); it does not cover a second endpoint or credential.

## Purpose

Let a failed foreground generation or memory task continue with another model without asking the user to configure a second connection or add a separate fallback toggle.

## User-Visible Contract

- The connection section exposes one 后台模型 field in addition to the primary model field.
- Entering a non-empty 后台模型 enables the fallback; leaving it empty disables it. No separate on/off switch is shown.
- The fallback uses the same destination and credential as the primary model; only the model name differs.
- No fallback-specific endpoint or credential controls are shown.
- Quiet or background work does not consume the fallback model. Only user-visible primary work can fall back.
- Earlier fallback-related settings are folded into this single field. A disabled legacy fallback does not reappear as a separate configuration.

## Semantic Interaction IDs

- `feature.fallback_provider.model`: entering or clearing the fallback model name.

## Acceptance Workflows

- As a user whose primary model fails during a foreground reply, provide a non-empty 后台模型 in [Settings](page.settings), then send a message; EmberDesk must retry with the fallback model on the same connection and show the fallback indicator in [Chat Workspace](page.chat_workspace), and failure is a second endpoint or credential being required.
- As a user who does not want a fallback, clear the 后台模型 field and save; EmberDesk must make no fallback attempt on a later failed generation, and failure is a separate fallback toggle remaining active or a hidden fallback still being used.
- As a user of quiet or background generation, configure a fallback model and start a quiet task; EmberDesk must not consume the fallback model for that task, and failure is a visible or hidden fallback attempt for work that is not user-visible.
- As a user with an earlier fallback configuration, open [Settings](page.settings); EmberDesk must present the fallback through the single 后台模型 field and must not restore a disabled legacy fallback as a separate active setting.

## Failure Signals

- The fallback model is attempted while its field is empty, or is skipped while a non-empty field is present and the primary model fails.
- A second endpoint or credential control appears for the fallback.
- Quiet or background work emits a fallback indicator or consumes the fallback model.
- A disabled legacy fallback reappears as an active separate setting.
- The fallback indicator is shown for a reply that did not use the fallback model.

## Boundaries

- Covers only the 后台模型 field and its user-visible use on foreground work.
- Automatic fallback indicators, retry scope, and final reply behavior belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- The single endpoint and credential used by both primary and fallback models belong to [Custom Base URL](feature.custom_base_url); quiet and background memory behavior belongs to [Chat Memory](feature.chat_memory).
