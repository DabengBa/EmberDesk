---
id: feature.chat_generation_auto_recovery
type: feature
name: Chat Generation Auto Recovery
related: [page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions, feature.fallback_provider]
---

# Feature: Chat Generation Auto Recovery

## ID 解释

`feature.chat_generation_auto_recovery` represents the bounded retry chain that EmberDesk uses for visible main-chat generation failures. It covers the primary retry, the optional fallback-provider retry, the in-row recovery status, and the final manual retry CTA. It does not cover quiet generation, background generation, or provider-specific routing systems.

## Purpose

Recover visible main-chat generation failures through a bounded retry chain before asking the user to retry manually.

## User-Visible Contract

- The feature applies to visible main-chat send, continue, regenerate/retry, and swipe requests that produce or update an assistant row.
- Recovery is bounded: the original request may be followed by one primary-provider retry and, when a ready fallback provider exists, one fallback-provider retry.
- Recoverable failures keep the user message and assistant row identity stable; partial assistant text from an intermediate failed attempt is cleared before the next attempt continues.
- If automatic recovery succeeds, the user sees only the final assistant text in the existing row.
- If all automatic attempts fail, EmberDesk preserves the failed assistant row and exposes the ordinary manual retry action on that same row.
- When the guarded React main-chat shell is mounted, the current generation/recovery phase can also appear as a local shell status near the composer; this is placement/status ownership, not a new retry algorithm.
- User stop is not automatic recovery; stopping generation leaves the workspace in the existing usable stop state without starting a new retry.
- Unsupported visible generation paths and non-visible quiet/background helper requests remain outside this recovery promise and must fall back or complete without pretending to be visible-row recovery.

## Semantic Interaction IDs

- `feature.chat_generation_auto_recovery.primary_retry`: the automatic retry against the primary provider.
- `feature.chat_generation_auto_recovery.fallback_retry`: the automatic retry against the configured fallback provider.
- `feature.chat_generation_auto_recovery.status`: the in-row recovery status shown while the user waits.
- `feature.chat_generation_auto_recovery.final_retry`: the manual retry action after automatic recovery is exhausted.

## Acceptance Workflows

- As a chat user whose visible generation hits a recoverable primary-provider failure, from [Chat Workspace](page.chat_workspace) send or continue a message and let recovery run; EmberDesk must preserve the user message and assistant row, show recovery status, retry once on the primary provider, and either finalize text in the same row or expose manual retry after exhaustion, while refresh/reopen must not show duplicate assistant rows, and failure is row duplication, stale partial text, or unbounded retry.
- As a user with [Fallback Provider](feature.fallback_provider) fully configured, from the same visible generation path encounter a second recoverable failure; EmberDesk must attempt the fallback at most once, show the final assistant text in the original row if it succeeds, and after refresh or final failure show the manual retry CTA if fallback fails, with failure signaled by fallback use when disabled, missing, or repeated indefinitely.
- As a user who stops generation, from the active generation controls choose stop before recovery finishes and then retry manually only if desired; EmberDesk must leave the conversation in a stopped-but-usable state without triggering primary or fallback retry after stop, and failure is a new automatic attempt after an explicit stop.
- As a user on an unsupported visible transport path, from a non-OpenAI, group, dry-run, or nested-visible request trigger generation and reopen the chat after it settles; EmberDesk must stay on the documented compatibility path with coherent visible row behavior, not a half-owned recovery state, and failure is hidden owner markers claiming recovery while the visible row behaves differently.

## Feature-Specific Evidence

- In-row recovery status, preserved user message, single assistant row, final text, stop state, and manual retry CTA are primary evidence.
- Hidden `generationControl`, `streamingTransport`, visible transport decision, and quiet/background transport markers are diagnostic evidence only when they match the visible row outcome.
- `data-main-chat-local-status` is local shell-status evidence only; retry bounds and final row outcome still require generation-control, transport, row, and CTA proof.
- Provider response errors, stream interruptions, and fallback-call counts support proof of the bounded attempt chain.

## Failure Signals

- Automatic recovery creates duplicate assistant rows or duplicate user messages.
- Partial text from a failed intermediate attempt remains visible as final content.
- User stop starts a retry.
- Fallback provider is used when it is disabled or incomplete.
- Recovery loops beyond the original request, one primary retry, and one fallback retry.

## Boundaries

- Fallback endpoint configuration belongs to [Fallback Provider](feature.fallback_provider).
- Stable message body and row identity belong to [Chat Message Rendering](feature.chat_message_rendering).
- Manual row retry controls belong to [Chat Message Actions](feature.chat_message_actions).
- Quiet/background generation, provider-specific routing, and slash-command pause/continue/abort behavior are outside this feature.
