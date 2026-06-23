# React Phase 6: Extension Compatibility Evidence

Status: delivered archive entry
Primary durable owner: [react-phase6-extension-compat-sequenced-specs](../../tech/briefs/react-phase6-extension-compat-sequenced-specs.md)

## Purpose

Phase 6 is the evidence and maintenance phase that closed the extension-facing compatibility gate before Phase 7 owner-cutover deletions, freezes, or long-term support decisions. As of 2026-06-23, the dated Phase 6 implementation specs are fully delivered and wrapped up. This README is intentionally minimal: it survives only as a legacy archive redirect for older links. The durable Phase 6 owner record now lives in the archive brief.

## Redirect Targets

- Archive brief: [react-phase6-extension-compat-sequenced-specs](../../tech/briefs/react-phase6-extension-compat-sequenced-specs.md)
- Roadmap phase entry: [react-modernization-roadmap](../../tech/react-modernization-roadmap.md)
- Compatibility owner doc: [third-party-extension-compatibility](../../tech/third-party-extension-compatibility.md)
- Project history: [PROJECT_HISTORY](../../PROJECT_HISTORY.md)
- Project overview: [project-overview](../../project-overview.md)

## Hard Gate

Phase 6 的 primary compatibility gate 是 `JS-Slash-Runner`。

- 任何会影响 `JS-Slash-Runner` import、mount、event、slash-command、regex 或相关 global/export surface 的变更，默认视为高优先级兼容风险。
- 其他扩展如 Quick Reply、Extensions Manager、Regex Manager 作为次级证据面，仅在它们能补充 `JS-Slash-Runner` 未覆盖的风险时进入同批验证。
- 若某个 breaking candidate 会破坏 `JS-Slash-Runner` 且没有明确替代路径、迁移说明和回滚方案，则该 candidate 不得进入 Phase 7 删除或收窄路径。

## Validation

```powershell
bun run test:compat
bun run docs:check
```

When the change touched global compatibility evidence, the delivered proof also included:

```powershell
bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand
```
