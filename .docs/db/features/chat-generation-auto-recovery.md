---
id: feature.chat_generation_auto_recovery
type: feature
name: Chat Generation Auto Recovery
related: [page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions, feature.fallback_provider]
---

# Feature: Chat Generation Auto Recovery

## ID 解释

`feature.chat_generation_auto_recovery` represents the bounded retry chain that EmberDesk uses for visible main-chat generation failures. It covers the primary retry, the optional fallback-model retry, the in-row recovery status, and the final manual retry action. It does not cover quiet generation, background generation, or provider-specific routing.

## Purpose

Recover visible main-chat generation failures through a bounded retry chain before asking the user to retry manually.

## User-Visible Contract

- The feature applies to visible main-chat send, continue, and regenerate/retry requests that produce or update an assistant row.
- Recovery is bounded: the original request may be followed by one primary-provider retry and, when a fallback model is configured, one fallback-model retry on the same connection.
- Server generation uses this bound for a plain reply or for the current pipeline round only. A completed step or browser action is not run again, and deterministic client-side errors are not retried.
- Recoverable failures keep the user message and assistant row stable; partial assistant text from an intermediate failed attempt is cleared before the next attempt continues.
- The in-row retry and fallback notices use the same entrance and spinner as [Chat Turn Regenerate](feature.chat_regenerate), but describe what is happening (正在重试 or 正在使用备用服务商). Automatic recovery does not hide previous replies.
- If automatic recovery succeeds, the user sees only the final assistant text in the existing row.
- If all automatic attempts fail, EmberDesk preserves the failed assistant row and exposes the ordinary manual retry action on that same row. The chat-options 重新生成 command is the exception: its terminal failure removes the failed attempt and restores the previous turn instead of leaving a retry row (see [Chat Turn Regenerate](feature.chat_regenerate)).
- The visible shell may show the current generation or recovery phase near the composer without starting a new retry algorithm.
- User stop is not automatic recovery; stopping generation leaves the workspace in the existing usable stop state without starting a new retry.
- Quiet or background helper requests remain outside this recovery promise: they create no assistant row, return generated text, and do not auto-retry. Visible request families use the same action path, but only eligible top-level visible requests receive bounded automatic recovery.

## Unified Generation Boundary

All main-chat and automation request families use one user-visible generation lifecycle. Visible controls only choose the requested action; recovery behavior remains the same regardless of which compatible entry point started the request.

## Semantic Interaction IDs

- `feature.chat_generation_auto_recovery.primary_retry`: the automatic retry against the primary provider.
- `feature.chat_generation_auto_recovery.fallback_retry`: the automatic retry against the configured fallback provider.
- `feature.chat_generation_auto_recovery.status`: the in-row recovery status shown while the user waits.
- `feature.chat_generation_auto_recovery.final_retry`: the manual retry action after automatic recovery is exhausted.

## Acceptance Workflows

- As a chat user whose visible generation hits a recoverable primary-provider failure, from [Chat Workspace](page.chat_workspace) send or continue a message and let recovery run; EmberDesk must preserve the user message and assistant row, show recovery status, retry once on the primary provider, and either finalize text in the same row or expose manual retry after exhaustion, while refresh/reopen must not show duplicate assistant rows, and failure is row duplication, stale partial text, or unbounded retry.
- As a user with [Fallback Provider](feature.fallback_provider) fully configured, from the same visible generation path encounter a second recoverable failure; EmberDesk must attempt the fallback at most once, show the final assistant text in the original row if it succeeds, and after refresh or final failure show the manual retry action if fallback fails, with failure signaled by fallback use when disabled, missing, or repeated indefinitely.
- As a user who stops generation, from the active generation controls choose stop before recovery finishes and then retry manually only if desired; EmberDesk must leave the conversation in a stopped-but-usable state without triggering primary or fallback retry after stop, and failure is a new automatic attempt after an explicit stop.
- As a user on a different visible generation entry point, trigger generation and reopen the chat after it settles; EmberDesk must preserve its documented visible-row or return-result behavior without a partial recovery state, and failure is a duplicated row, stale partial text, or a result that differs by entry point.

## Failure Signals

- Automatic recovery creates duplicate assistant rows or duplicate user messages.
- Partial text from a failed intermediate attempt remains visible as final content.
- User stop starts a retry.
- Fallback provider is used when it is disabled or incomplete.
- Recovery loops beyond the original request, one primary retry, and one fallback retry.
- A completed pipeline step or browser action is run again during recovery.

## Boundaries

- Fallback endpoint configuration belongs to [Fallback Provider](feature.fallback_provider).
- Stable message body and row identity belong to [Chat Message Rendering](feature.chat_message_rendering).
- Manual row retry controls belong to [Chat Message Actions](feature.chat_message_actions).
- Quiet/background generation and provider-specific routing are outside this feature.
