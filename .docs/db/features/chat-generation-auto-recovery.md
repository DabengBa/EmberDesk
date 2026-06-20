---
id: feature.chat_generation_auto_recovery
type: feature
name: Chat Generation Auto Recovery
related: [page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions, feature.fallback_provider]
---

# Feature: Chat Generation Auto Recovery

## ID 解释

`feature.chat_generation_auto_recovery` represents the bounded retry chain that EmberDesk uses for visible main-chat generation failures. It covers the primary retry, the optional fallback-provider retry, the in-row recovery status, and the final manual retry CTA. It does not cover quiet generation, background generation, or provider-specific routing systems.

## Feature Purpose

This feature lets EmberDesk recover from temporary visible-chat generation failures without immediately asking the user to restart the request by hand.

## Trigger Entry

- **Primary entry**: send, regenerate, continue, or swipe a visible main-chat reply.

## Interaction IDs

- `feature.chat_generation_auto_recovery.primary_retry`: the automatic retry against the primary provider.
- `feature.chat_generation_auto_recovery.fallback_retry`: the automatic retry against the configured fallback provider.
- `feature.chat_generation_auto_recovery.status`: the in-row recovery status message.
- `feature.chat_generation_auto_recovery.final_retry`: the existing manual retry CTA after automatic recovery is exhausted.

## User Flow

1. The user triggers a visible generation in the main chat.
2. EmberDesk tries the primary provider.
3. If the result is empty or otherwise recoverable, EmberDesk automatically retries once on the primary provider.
4. If that still fails and the fallback provider is ready, EmberDesk automatically retries once on the fallback provider.
5. If the fallback attempt succeeds, EmberDesk keeps only the final assistant text in the existing message row.
6. If all attempts fail, EmberDesk shows the existing manual retry CTA on the same failed row.

## Business Rules And Boundaries

- Recovery is bounded to three visible attempts total: original request, primary retry, and fallback retry.
- Recoverable failures include empty reply, provider failure, streaming interruption, and other recoverable generation errors handled by the visible main-chat path.
- User stop does not enter the automatic recovery chain.
- Intermediate retry attempts clear partial assistant text before the next attempt continues.
- Intermediate attempts do not expose the final message-rendered events that belong to the finished visible row.
- The final failed state preserves the assistant row identity and uses the existing manual retry action.
- When `features.react.panels.mainChatMessageList` is enabled, the guarded React controller may consume a Zod-validated `generationControl` snapshot that reports the current recovery phase. That snapshot is a hidden bridge contract only; `Generate()`, `StreamingProcessor`, provider routing, token append, user stop, retry sequencing, and final retry handlers remain legacy-owned.
- Provider stream pause/resume is not part of this feature. Slash-command execution has its own `SlashCommandAbortController` pause/continue/abort state and is outside this auto-recovery boundary.

## ID Boundary Notes

This feature is separate from [Fallback Provider](feature.fallback_provider) because it owns attempt sequencing rather than provider configuration. It is also separate from [Chat Message Rendering](feature.chat_message_rendering) because it depends on stable rows but does not define the base rendering contract.

## Outcomes

- **Success state**: the visible assistant row contains the final generated text after at most one primary retry and one fallback retry.
- **Final failure state**: the visible assistant row keeps its identity and exposes the ordinary retry CTA only after automatic recovery has been exhausted.
- **Stop state**: user stop leaves the generation in the existing stop-to-usable state without triggering a new automatic retry.
