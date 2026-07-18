# Task 02 Evidence - Provider and request assembly service path

## Summary

`Generate()` now creates a generation request envelope and delegates its planned attempts to the shared command service. Provider builders, group orchestration, quiet/background wrappers, dry-run, and nested execution retain their existing request/result behavior inside the shell.

## Red-green notes

- The command-service matrix first made every request family explicit.
- The shell then replaced its local attempt loop with `executeGenerationAttempts`; focused provider and lifecycle tests remained green.

## Command

```bash
bun run --cwd tests test:unit -- chat-generation-command-service.test.js chat-generation-lifecycle.test.js chat-generation-auto-recovery.test.js chat-completions-openai-fallback.test.js chat-completions-google.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand
```

## Result

- 7 suites / 129 tests passed.
- The service preserves single-attempt behavior for non-OpenAI, dry-run, nested, quiet, and background commands; eligible visible OpenAI commands retain bounded primary and fallback recovery.

## Artifacts

- `public/script.js`
- `public/scripts/chat-generation-command-service.js`
- `tests/chat-generation-command-service.test.js`
