# Main Chat Message Actions Bridge Processing Flow

## Metadata

- Owner: main-chat message-actions bridge documentation
- Current code bindings:
  - `public/scripts/chat-message-actions-controller.js`
  - `public/script.js`
  - `app/workspace-panels.tsx`
  - `tests/chat-message-actions-controller.test.js`
  - `tests/react-workspace-panels-helpers.test.js`
  - `tests/chat-message-rendering.e2e.js`
- Related semantic docs:
  - [.docs/db/features/chat-message-actions.md](../db/features/chat-message-actions.md)
  - [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md)
  - [.docs/db/features/chat-message-rendering.md](../db/features/chat-message-rendering.md)
- Related tech docs:
  - [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)
  - [.docs/tech/third-party-extension-compatibility.md](../tech/third-party-extension-compatibility.md)

## Goals And Non-Goals

Goals:

- Document the current rules that turn legacy message-row action DOM into `messageActionSnapshots` and the React-owned visible action shell for safe rows.
- Make the action-name parsing, shared tier mapping, expanded-state detection, target validation, and owner handoff reproducible without importing production code.
- Record the ownership boundary between the React-owned visible action shell and the legacy business handlers it still calls.

Non-goals:

- Re-document the visible click handlers, delegated expand/collapse controller, delete confirmation flow, or edit-mode lifecycle.
- Replace the existing copy/edit/delete/swipe/reasoning/retry business handlers with new React-only logic.
- Replace the browser E2E proofs for copy, edit, delete, mobile reachability, or long-chat rendering.

## Input Discovery And Parsing Rules

The legacy bridge reads current browser facts from `public/script.js` and `public/scripts/chat-message-actions-controller.js`:

1. `#chat > .mes[mesid]` direct children are the only candidate rows.
2. A row must expose `.mes_buttons`; otherwise it produces no action snapshot.
3. Available actions are read from descendant `[role="button"]` nodes under the row, not from future-only config or hidden React state.
4. Action names are parsed from class lists with these rules:
   - ignore generic classes such as `mes_button`, `menu_button`, `edit_button`, `right_menu_button`, `interactable`, `displayNone`, and any `fa-*` icon class
   - accept `extraMesButtonsHint`, `swipe_left`, `swipe_right`, `generation_failure_retry`, `sd_*`, and `mes_*` action classes
   - keep first-seen order and drop duplicates
5. Action tiers come only from `MESSAGE_ACTION_TIERS` in `chat-message-actions-controller.js`:
   - `highFrequency`: `extraMesButtonsHint`, `mes_copy`, `mes_edit`
   - `secondary`: `mes_bookmark`, `mes_swipe_picker`, `mes_reasoning_copy`, `mes_gallery`, `mes_translate`, `mes_narrate`, `mes_hide`
   - `danger`: `mes_edit_delete`, `mes_reasoning_delete`
6. `expanded` becomes `true` when any current legacy signal says the row is already expanded:
   - the global `expand_message_actions` power-user setting is on
   - `.extraMesButtons` currently has `visible`
   - `.extraMesButtonsHint` is hidden with `display: none`
7. React marker ownership requires a stricter target check than snapshot discovery:
   - row is still connected
   - row is still a direct child of `#chat`
   - row `mesid` still matches the validated snapshot `messageId`
   - `.mes_buttons`, `.extraMesButtonsHint`, and `.extraMesButtons` still exist

## Outputs

The bridge output is `messageActionSnapshots` inside the existing `mainChatMessageList` bridge state:

```json
{
  "messageActionSnapshots": [
    {
      "schema": "mainChatMessageActionSnapshotSchema",
      "messageId": "12",
      "eligible": true,
      "expanded": false,
      "availableActions": ["extraMesButtonsHint", "mes_copy", "mes_edit", "mes_edit_delete"],
      "highFrequencyActions": ["extraMesButtonsHint", "mes_copy", "mes_edit"],
      "secondaryActions": [],
      "dangerActions": ["mes_edit_delete"]
    }
  ]
}
```

React validates the payload with a Zod schema in `app/workspace-panels.tsx`. Invalid or missing snapshots are dropped, and legacy visible action ownership remains unchanged.

The React-visible output now has two layers for safe rows:

1. a hidden owner marker appended inside `.mes_buttons`
2. the visible React action shell that reuses the protected roles, names, order, and legacy bridge callbacks for the same row

The marker payload still looks like:

```json
{
  "data-main-chat-message-actions-owner": "react",
  "data-main-chat-message-actions-row": "12",
  "data-main-chat-message-actions-expanded": "false",
  "data-main-chat-message-actions-available": "extraMesButtonsHint|mes_copy|mes_edit|mes_edit_delete",
  "data-main-chat-message-actions-high-frequency": "extraMesButtonsHint|mes_copy|mes_edit",
  "data-main-chat-message-actions-secondary": "",
  "data-main-chat-message-actions-danger": "mes_edit_delete"
}
```

## Staged Processing Flow

1. Legacy rendering produces `.mes_buttons`, `.extraMesButtonsHint`, `.extraMesButtons`, and the existing copy/edit/delete/swipe/reasoning/retry controls.
2. The delegated controller created by `createChatMessageActionsController()` remains the business-behavior owner for menu open/close, edit, retry, swipe, reasoning, and related actions.
3. `getMainChatMessageListReactBridgeState()` enumerates direct-child `#chat > .mes[mesid]` rows and calls `buildMessageActionSnapshot()` for each row.
4. `buildMessageActionSnapshot()` derives `availableActions`, `expanded`, and tier arrays from the current DOM only; it never reads message text or invents missing action names.
5. `public/script.js` normalizes each snapshot to the shared `mainChatMessageActionSnapshotSchema` string and forwards the array as `messageActionSnapshots`.
6. `app/workspace-panels.tsx` validates the array with `mainChatMessageActionSnapshotSchema`. Invalid entries are dropped before React decides whether to mount anything for that row.
7. For each validated snapshot, `canReactOwnMainChatMessageActions()` confirms the row still matches the snapshot and still exposes the protected action shell.
8. React appends one hidden marker into `.mes_buttons` through a portal. The marker carries row id, expanded state, and tier metadata for observation only.
9. For rows that still pass the stricter target validation, React also renders the visible action shell through the existing `.mes_buttons` slot, preserving protected roles/names and the same tier order.
10. Clicking a visible React-owned action routes back through the legacy action bridge. If the row enters edit mode or otherwise becomes unsafe, that row drops the React visible shell and hands ownership back to legacy before the user sees a mixed action surface.

## Key Rules

- The snapshot bridge is DOM-derived and observational. It must not persist message-action data into chat storage or derive actions from message text.
- `MESSAGE_ACTION_TIERS` is the single tier source. React must not maintain a second tier table with different names or ordering.
- Snapshot discovery is broader than React ownership: a row can produce a snapshot yet still fail the stricter target check and receive no hidden marker.
- The hidden owner marker is additive only. It must not wrap, replace, or reorder `.extraMesButtonsHint`, `.extraMesButtons`, copy/edit/delete controls, swipe controls, reasoning controls, or retry controls.
- The visible React action shell must preserve the protected action names, order, overflow semantics, and mobile reachability while still calling the legacy handlers.
- In the current protected ordering, `.extraMesButtonsHint` stays before `.extraMesButtons`, and the hidden action marker is appended after those protected controls.
- Expanded state is descriptive, not authoritative. React can report that a row is expanded, but legacy code still decides whether outside click closes the overflow surface.
- Validation fails closed. Unsupported payload shapes, detached rows, missing protected targets, or edit-mode transition result in legacy visible ownership for that row instead of a partial React takeover.

## Output Schema

```json
{
  "messageActionSnapshots[].messageId": "non-empty string",
  "messageActionSnapshots[].eligible": true,
  "messageActionSnapshots[].expanded": "boolean",
  "messageActionSnapshots[].availableActions": "ordered unique string[]",
  "messageActionSnapshots[].highFrequencyActions": "subset of availableActions",
  "messageActionSnapshots[].secondaryActions": "subset of availableActions",
  "messageActionSnapshots[].dangerActions": "subset of availableActions",
  "hiddenMarker.available": "pipe-joined snapshot.availableActions",
  "hiddenMarker.expanded": "\"true\" or \"false\"",
  "hiddenMarker.row": "snapshot.messageId"
}
```

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/main_chat_message_actions_bridge_sandbox_proof.py
```

The proof script embeds fake message rows and validates tier-aware snapshot output, duplicate/generic class filtering, expanded-state detection, fail-closed snapshot suppression when `.mes_buttons` is missing, strict target validation for hidden-marker ownership, and additive marker output appended after the protected legacy controls. Visible action-shell behavior and edit-mode fallback stay covered by the browser/unit proofs listed in the metadata.

## Boundaries And Failure Modes

- If a row has no `mesid` or no `.mes_buttons`, it produces no snapshot and remains fully legacy-owned.
- If a row loses `.extraMesButtonsHint` or `.extraMesButtons` after snapshot capture, React emits no hidden marker for that row.
- If the snapshot payload is malformed or unsupported on the React side, Zod validation drops it and the row stays legacy-owned.
- If the guarded workspace-panels bundle is disabled, missing, or fails to mount, users still see the normal legacy message actions without a degraded visible surface.
- This flow gives React the visible shell for safe rows, but copy, edit, delete, swipe, reasoning, retry, and menu-open behavior still route through the proven legacy handlers.
