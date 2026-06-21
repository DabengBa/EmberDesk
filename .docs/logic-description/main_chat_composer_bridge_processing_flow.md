# Main Chat Composer Bridge Processing Flow

## Metadata

- Owner: main-chat composer bridge documentation
- Current code bindings: `public/scripts/main-chat-composer-state.js`, `public/script.js`, `app/workspace-panels.tsx`
- Related semantic docs: [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md), [.docs/db/features/chat-message-rendering.md](../db/features/chat-message-rendering.md), [.docs/db/features/chat-generation-auto-recovery.md](../db/features/chat-generation-auto-recovery.md)
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)

## Goals And Non-Goals

Goals:

- Document how legacy composer facts become the hidden React `composer` bridge payload.
- Prove focus, empty/non-empty, sendability, disabled/generating, and active context without exposing prompt text.
- Record why this Sprint is not a TanStack Form takeover.

Non-goals:

- Replace `#send_textarea`, `#send_but`, `sendTextareaMessage()`, or `Generate()`.
- Change Enter, Shift+Enter, paste, focus retention, or mobile composer layout.
- Store prompt text in React markers or docs.

## Input Discovery And Parsing Rules

`public/script.js` reads only metadata from the legacy composer:

1. `#send_textarea.value.length` provides `valueLength`; raw text is not copied into the bridge marker.
2. `document.activeElement === #send_textarea` provides focus state.
3. `#send_textarea.disabled`, `#send_but.disabled`, and `document.body.dataset.generating` provide disabled/generating state.
4. The active context is normalized to `character`, `group`, `assistant`, or `none` from existing legacy globals.
5. The bridge refreshes after textarea input/focus/blur/click and relevant form/body mutations.

`public/scripts/main-chat-composer-state.js` normalizes these facts into booleans and a safe context enum.

## Outputs

The bridge output is `composer` inside `mainChatMessageList` state:

```json
{
  "valueLength": 42,
  "isEmpty": false,
  "canSubmit": true,
  "isFocused": true,
  "isDisabled": false,
  "isGenerating": false,
  "activeContext": "character"
}
```

React validates the payload with Zod. Invalid or missing payloads fall back to an empty, non-submittable composer state.

Hidden marker attributes include:

- `data-main-chat-composer-length`
- `data-main-chat-composer-empty`
- `data-main-chat-composer-can-submit`
- `data-main-chat-composer-focused`
- `data-main-chat-composer-disabled`
- `data-main-chat-composer-generating`
- `data-main-chat-composer-context`

## Key Rules

- The bridge never exposes raw prompt text.
- Empty input is not submittable.
- Generating or disabled state makes the bridge non-submittable, while legacy stop/recovery controls remain visible owners.
- `activeContext=none` fails closed to non-submittable.
- React does not click send, synthesize submit, clear textarea, or append user rows.
- Future visible composer migration must use TanStack Form + Zod and define the send mutation/status-query owner in a new spec.

## Verification

Focused proof:

```powershell
bun run --cwd tests test:unit -- main-chat-composer-state.test.js react-workspace-panels-helpers.test.js --runInBand
$env:EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST='true'; bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js
```

The browser proof covers ordinary input, Shift+Enter newline, legacy send path, after-send clear, empty-submit no-op, stop/error recovery input, and mobile composer reachability.
