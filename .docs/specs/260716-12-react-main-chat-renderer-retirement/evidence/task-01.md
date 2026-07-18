# Task 01 Evidence — Formatter → render service (no DOM side effects)

## Summary

Introduced framework-neutral `public/scripts/chat-message-render-service.js` as the rich-body HTML owner. It builds `messageHtml` / `reasoningHtml` / `mediaHtml` / `fileHtml` / `biasHtml` from message data via an injected `formatMessage` (existing `messageFormatting` contract), never inserts DOM, and reuses the pure row descriptor for role/state/flags.

`public/script.js` now delegates body + bias production through `buildChatMessageRichBody()` → `buildChatMessageRichBodyRender()`. Callers still apply HTML into rows; the service itself has `insertsDom: false`.

## TDD notes

- RED: `tests/chat-message-render-service.test.js` failed with missing module.
- GREEN: service + script wiring + structure contract markers.
- Also repaired a pre-existing structure assertion that still expected lifecycle planning strings inside `script.js` after transport retirement moved them into `chat-generation-command-service.js`.

## Commands

```bash
bun run --cwd tests test:unit -- chat-message-render-descriptor.test.js chat-message-render-service.test.js chat-workspace-structure.test.js --runInBand
```

## Result

- 3 suites / 27 tests passed
- PM: stored/system/user/media/file/regex-ready fixtures produce rich-body HTML via the service; JSON never claims DOM insertion; service source has no `document.createElement` / `innerHTML` / `$()`

## Artifacts

- `public/scripts/chat-message-render-service.js`
- `public/scripts/chat-message-render-descriptor.js` (comment update)
- `public/script.js` (`buildChatMessageRichBody` delegation)
- `tests/chat-message-render-service.test.js`
- `tests/chat-workspace-structure.test.js`
