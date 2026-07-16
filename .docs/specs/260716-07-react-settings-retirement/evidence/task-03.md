# Task 03 Evidence — UI / formatting / advanced + apply

## Summary
Bound remaining Advanced Formatting instruct/context sequences, expanded UI form coverage to match drawer fields already inventoried, added workspace return affordance and session save markers so reload/return consumers can treat saved document as authority.

## Changes
- Extra instruct/context sequence bindings in `settings-helpers.js` (input/output/system sequences, story string inject metadata)
- `settings.tsx` fields generated for all form defaults; workspace back link; save status notes reload parity; sessionStorage markers `emberdesk-settings-saved-at` / `emberdesk-settings-revision`
- Header CSS for workspace link row

## Proof
```
settings-react-route.test.js — PASS 8 tests (incl. AF sequences round-trip)
bun run build:react — PASS (settings-RWph74Nj.js emitted)
```

## PM
Edit instruct output sequence alone → only that path changes; remaining instruct/context values and unrelated keys preserved. Successful save advertises workspace/reload application contract.
