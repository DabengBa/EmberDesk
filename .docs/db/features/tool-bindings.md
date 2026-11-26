---
id: feature.tool_bindings
type: feature
name: Tool Bindings
related: [page.chat_workspace]
---

# Feature: Tool Bindings

## ID 解释

`feature.tool_bindings` represents the user-level function-tool editor in [Chat Workspace](page.chat_workspace). It covers defining named tools, enabling them, and making them available to chat completions. It does not cover preset-carried tool definitions or third-party extension tool APIs.

## Purpose

Let users register function tools without writing an extension. When a model produces a matching tool call, the bound action runs and its result continues the generation.

## User-Visible Contract

- The drawer has two tabs: 正则 for regex work and 工具绑定 for the tool bindings list and editor.
- Keyboard users can switch tabs, reach each binding's enable switch, and get a visible focus indicator; each switch's accessible name identifies the binding.
- A keyboard-accessible 强制调用 control exists with its visible label exposed as its accessible name.
- Bindings are global user settings, not part of a preset or a specific character.
- Each binding has a tool name, optional display name, model-facing description, parameter definition, action body, optional result-format body, enabled state, and hidden-execution state.
- The Reply Pipeline toggle suppresses tool use: while it is off, later generations do not use bindings; turning it on restores eligible bindings, and a run already in progress completes with the tools it captured. At least one enabled binding and a compatible source are also required.
- A tool action receives the tool-call arguments and returns text or an error; runtime and syntax errors are reported back into generation instead of breaking it.
- A response containing only tool calls and no text is a valid reply.
- Hidden-execution bindings do not show the invocation in chat and do not trigger a follow-up reply.
- Actual tool invocations are retained and appear in later requests with their calls and results paired. In server-generated [Reply Pipeline](feature.reply_pipeline) runs, a matching step result uses a text carrier or sends a custom action to the browser. Text-only steps remain text without an invented call or result. Completed pipeline replies supply their current effective body rather than replaying those records. Eligible bodies become request-only representations in later pipeline requests, or ordinary assistant text outside that view. These representations are not executable bindings; mixed records keep real tool replay.
- Multiple calls in one response run in sequence; calls in the same batch cannot see each other's results, so dependent steps require another round.
- Recursion is bounded to five rounds.
- [Reply Pipeline](feature.reply_pipeline) step names automatically acquire missing text bindings when a name is committed, a preset is applied, or settings load. Generated bindings take a content argument and return that text directly. Existing custom schemas and actions survive; passive loading preserves disabled and hidden flags, while explicit name commit or pipeline activation enables them and clears hidden execution. Removing a step never removes its binding.

## Acceptance Workflows

- As a keyboard user, open the drawer, switch between 正则 and 工具绑定, and reach the 强制调用 control and a binding's enable switch; EmberDesk must keep the tab names and switch states announced and focus visible, and failure is a control that can only be used by pointer.
- As a user defining a tool, enter its name, description, parameters, and action, then enable it and send a message that leads to a matching call; EmberDesk must run the action and feed its result back into generation, and failure is a syntax or runtime error breaking the reply loop.
- As a user of hidden execution, enable that state on a binding and trigger it; EmberDesk must hide the invocation and skip the follow-up reply, while ordinary bindings still show their calls and results.
- As a user with the pipeline enabled, configure a custom step action and trigger the step; EmberDesk must run the browser action and retain the paired result, while text-only steps remain text without a fabricated call.
- As a user whose pipeline step name matches an existing custom binding, commit the name and later remove the step; EmberDesk must keep the custom behavior and flags and must not delete the binding.

## Failure Signals

- Bindings are stored in a preset or tied to one character instead of the user.
- Keyboard focus is invisible or a switch's accessible name does not identify its binding.
- Tool calls in one batch see each other's results, or recursion exceeds five rounds.
- Runtime errors break generation instead of being reported back to the model.
- A hidden-execution binding shows its invocation or triggers a follow-up reply.
- A synthetic request-only representation is executed as a real binding or written into chat history.
- Generated bindings replace custom schemas or actions, or removing a step deletes its binding.

## Boundaries

- Pipeline step order, step prompts, and final reply behavior belong to [Reply Pipeline](feature.reply_pipeline).
- Chat workspace placement belongs to [Chat Workspace](page.chat_workspace).
