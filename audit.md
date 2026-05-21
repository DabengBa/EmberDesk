# Audit

## Scope

`feature.chat_completion_select` / `chat-completion-select`

## Gate

- Doc ID check: passed (`npm run docs:check`)

## Findings

- None confirmed.

## Verification

- `node --check public/scripts/openai.js`
- `git diff --check -- public/index.html public/style.css .docs/db/features/chat-completion-select.html`
- `npm run docs:check`

## Notes

- Demo added at `.docs/db/features/chat-completion-select.html`
