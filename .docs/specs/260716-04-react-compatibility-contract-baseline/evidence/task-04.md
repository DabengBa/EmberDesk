# Task 04 Evidence — compatibility docs and deletion gate

## Commands
- `bun run docs:check`

## Result
- docs:check validated 30 semantic docs
- Updated:
  - `.docs/tech/third-party-extension-compatibility.md` (Executable Contract Baseline)
  - `.docs/tech/legacy-cutover-ledger.md` (Compatibility Contract Gate)
  - semantic notes on shared library, extension panel, character library, message rendering, chat workspace

## Summary
Owning docs now describe the baseline as a behavior gate for subsequent retirement packages, with current/replacement/proof/deletion readiness metadata and internal-bridge exclusion.
