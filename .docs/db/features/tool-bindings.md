---
id: feature.tool_bindings
type: feature
name: Tool Bindings
related: [page.chat_workspace]
---

# Feature: Tool Bindings

## ID 解释

`feature.tool_bindings` represents the user-level function-tool editor inside the Regex drawer of [Chat Workspace](page.chat_workspace). It covers defining named tools, enabling them, and having them travel to the chat-completion API as real `tools` entries. It does not cover preset-carried tool definitions, tool-call prompt engineering, or third-party extension tool APIs.

## Purpose

Let users register real OpenAI-style function tools without writing an extension. When a model emits a matching tool call, the bound action runs in the browser and the result recurses back into generation as a `tool` message.

## Ownership Direction

`public/scripts/tool-bindings.js` owns loading, registration, and editor behavior; `public/scripts/tool-bindings-core.js` owns pure normalization/validation/action compilation. The tab markup and editor popup chrome are React-owned inside the Regex drawer (`ToolBindingEditor`, `mountToolBindingEditor`). `ToolManager` in `public/scripts/tool-calling.js` remains the sole tool-call pipeline; user bindings are registered through it and tracked separately from code-registered tools.

## User-Visible Contract

- The Regex drawer carries two tabs: 正则 (the legacy regex workbench, unchanged) and 工具绑定 (the bindings list and editor entry point).
- Bindings persist globally in `feature_settings.tool_bindings` inside the user settings document — not inside preset files and not per character.
- Each binding carries: name (API tool name, 1-64 chars of letters/digits/`_`/`-`), optional display name, model-facing description, parameters JSON Schema, action body, optional format-message body, enabled flag, and stealth flag.
- There is no master switch: at least one enabled binding means tool calling is on for OpenAI-compatible sources; zero enabled bindings means no `tools` payload is sent.
- The action body executes as `async (args) => result` and receives exactly one parameter — the parsed tool-call arguments. Runtime and syntax errors are returned to the model as an `{ok:false,error}` payload rather than breaking the generation loop.
- A non-streaming reply that contains only tool calls (no text content) is valid and must not be treated as an empty reply.
- Stealth bindings hide the invocation from chat and skip the follow-up generation.
- Tool invocations are stored on a system chat message (`extra.tool_invocations`) and serialized back into later prompts as `role:"tool"` messages plus the preceding assistant `tool_calls` turn.
- One response may carry several tool calls (parallel tool calls on the wire). They are executed sequentially in array order and aggregated into a single invocations message; calls in the same batch cannot see each other's results — dependent steps must use recursion rounds.
- Recursion follows the existing `ToolManager.RECURSE_LIMIT` of 5.
