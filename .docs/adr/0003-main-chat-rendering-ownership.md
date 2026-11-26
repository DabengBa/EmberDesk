---
description: "Main-chat rows keep DOM identity via WeakMap UIDs and self-managed innerHTML; rejected alternatives explain why node pooling, hashing, and virtualization would reintroduce iframe loss."
kind: adr
topic: main-chat-rendering-ownership
id: "ADR-0003"
status: active
supersedes: null
created_at: 2026-11-26
affects_symbols:
  - "app/client.tsx#createRoot"
  - "app/components/main-chat/MainChatMessageListWorkspacePanel.tsx#MainChatMessageListWorkspacePanel"
---

# Main Chat Rendering Ownership

## Context

Deleting a reply card once made the whole chat disappear for seconds. Instrumentation and React DOM source inspection confirmed the mechanism: React 19 diffs `dangerouslySetInnerHTML` object literals by reference, so an equivalent `{ __html }` object reassigns `innerHTML` and destroys every child node, including surviving iframes. Row identity was the array index, so deletion shifted keys and remounted later rows; full snapshot rebuilds on every UI-state change re-ran formatting, and iframe height collapse truncated scroll position while scripts reloaded.

## Decision

Render identity is split from storage addressing: a `WeakMap` maps message objects to UIDs used only for React keys, frame ownership, and expanded-block state; commands, `mesid`, and indices keep their existing semantics. Row HTML is owned by React with a `<StaticHtml>` ref plus `useLayoutEffect` managing `innerHTML` directly, and `React.memo` blocks unrelated rerenders. Projection records are reused only when the chat id, array reference, length, message object, `mes`/`extra` references, UI state, and format epoch are all unchanged; formatter side effects are thereby decoupled from typing and menu noise. ``formatEpoch`` invalidates on settings updates. FramePool becomes a height cache written before mount plus a parent-side `ResizeObserver` on `iframe.contentDocument`; reinserted iframe nodes reload by specification, so pooling live nodes is not attempted. `frameIdSeed` derives frame identity from the UID while `EmberDeskFrame`'s exposed `messageId` keeps index semantics for user scripts.

## Rejected

- Content hashing for projection reuse: the formatter is not pure (DOMPurify needs DOM; regex/macros depend on conversation state), so equal content does not imply equal output.
- Iframe node pools: reinserting an iframe into the DOM necessarily reloads it, defeating reuse.
- Virtualization: `CHAT_TRUNCATION=100` already bounds DOM size, and the `.mes[mesid]` direct-child contract conflicts with virtual containers.
- Worker-based projection: formatter impurity and DOM dependencies require a pure-function extraction project first.
- Typed structured blocks: user regex drives `status-cards`/`pipeline-card`; typing would freeze an editable contract.
- Adding `sandbox` as security hardening while still claiming a same-origin trust model; that would be pseudo-hardening.

## Constraint

An unchanged message row MUST NOT have its DOM subtree touched, no `innerHTML`/`srcdoc` reassignment, on unrelated UI changes. Height caching MUST prevent scroll collapse across remounts. Inline HTML remains inside the same-origin trust model with existing `EmberDeskFrame` API semantics; cross-message document reuse, detached-iframe freeze, lazy mount, and global audit broadcast stay out of scope.
