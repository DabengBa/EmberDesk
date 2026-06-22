# Main Chat Slash Command Bridge Processing Flow

## Metadata

- Owner: main-chat slash-command bridge documentation
- Current code bindings: `public/scripts/main-chat-slash-command-state.js`, `public/script.js`, `app/workspace-panels.tsx`, `public/scripts/slash-commands.js`
- Related semantic docs: [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md), [.docs/tech/third-party-extension-compatibility.md](../tech/third-party-extension-compatibility.md)
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)

## Goals And Non-Goals

Goals:

- Document how legacy slash-command facts become the hidden React `slashCommand` bridge payload while the visible autocomplete/status UI now lives in React.
- Preserve parser, registry, executor, pause/continue, abort ownership, and public compatibility exports in legacy code.
- Avoid exposing full command text or arguments through hidden React markers.

Non-goals:

- Rewrite `public/scripts/slash-commands.js`.
- Change `executeSlashCommandsOnChatInput()`, `parser`, `registerSlashCommand`, regex placement, or Tavern Helper imports.
- Replace legacy execution logic with a new React-only slash protocol.

## Input Discovery And Parsing Rules

`public/script.js` still derives slash-command metadata from public legacy facts and forwards them to the React-owned visible surface:

1. `#send_textarea.value` is read only long enough to classify whether the trimmed input starts with `/` and to compute query length.
2. Autocomplete visibility is read from existing autocomplete wrapper/menu visibility.
3. Execution state is read from `isExecutingCommandsFromChatInput` and `#form_sheld.isExecutingCommandsFromChatInput`.
4. Pause and abort state are read from `#form_sheld.script_paused` and `#form_sheld.script_aborted`.
5. Error state is read from `#form_sheld.script_error`.

`public/scripts/main-chat-slash-command-state.js` returns only booleans, query length, and an optional error label. It does not return command text, args, parser objects, or registry entries.

## Outputs

The bridge output is `slashCommand` inside `mainChatMessageList` state:

```json
{
  "active": true,
  "queryLength": 5,
  "autocompleteVisible": true,
  "executing": false,
  "paused": false,
  "aborted": false,
  "errorLabel": null
}
```

React validates the payload with Zod. Invalid or missing payloads fall back to inactive slash state, and the visible slash surface fails closed to the legacy path instead of rendering a second incomplete autocomplete owner.

Hidden marker attributes include:

- `data-main-chat-slash-command-active`
- `data-main-chat-slash-command-query-length`
- `data-main-chat-slash-command-autocomplete`
- `data-main-chat-slash-command-executing`
- `data-main-chat-slash-command-paused`
- `data-main-chat-slash-command-aborted`
- `data-main-chat-slash-command-error`

## Key Rules

- Parser, command registry, execution, pause/continue, abort controller, and public slash exports remain legacy-owned.
- Query length is observational and must not affect parser behavior.
- Full command text and arguments must not appear in React marker attributes.
- `/` input can report active/autocomplete state; ordinary text must report inactive.
- The visible autocomplete list, selection/highlight state, and paused/aborted/error status UI now come from the React-owned slash surface, while command execution still routes through the legacy compatibility adapter.
- Protected slash-command exports stay stable for compatible extensions.
- Legacy autocomplete/details DOM must stay hidden when the React-owned visible slash surface is active so the user never sees two competing slash UIs.

## Verification

Focused proof:

```powershell
bun run --cwd tests test:unit -- main-chat-slash-command-state.test.js react-workspace-panels-helpers.test.js third-party-extension-compatibility.test.js --runInBand
bun run test:compat
$env:EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST='true'; bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js
```

The browser proof covers active/inactive slash marker state, autocomplete visibility, legacy `/delay` execution, pause/continue, abort, and post-clear fallback to inactive state.
