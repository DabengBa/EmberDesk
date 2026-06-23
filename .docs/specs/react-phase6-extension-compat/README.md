# React Phase 6: Extension Compatibility Evidence

Status: delivered archive entry
Owner doc: [React modernization roadmap](../../tech/react-modernization-roadmap.md)

## Purpose

Phase 6 is the evidence and maintenance phase that closed the extension-facing compatibility gate before Phase 7 owner-cutover deletions, freezes, or long-term support decisions. As of 2026-06-23, the dated Phase 6 implementation specs are fully delivered and wrapped up; this README remains as the durable phase-level archive entry so roadmap, history, and brief links do not depend on deleted process files.

## Durable Entry Points

- Archive brief: [react-phase6-extension-compat-sequenced-specs](../../tech/briefs/react-phase6-extension-compat-sequenced-specs.md)
- Compatibility owner doc: [third-party-extension-compatibility](../../tech/third-party-extension-compatibility.md)
- Project history: [PROJECT_HISTORY](../../PROJECT_HISTORY.md)
- Project overview: [project-overview](../../project-overview.md)

## Priority Rule

Phase 6 的 primary compatibility gate 是 `JS-Slash-Runner`。

- 任何会影响 `JS-Slash-Runner` import、mount、event、slash-command、regex 或相关 global/export surface 的变更，默认视为高优先级兼容风险。
- 其他扩展如 Quick Reply、Extensions Manager、Regex Manager 作为次级证据面，仅在它们能补充 `JS-Slash-Runner` 未覆盖的风险时进入同批验证。
- 若某个 breaking candidate 会破坏 `JS-Slash-Runner` 且没有明确替代路径、迁移说明和回滚方案，则该 candidate 不得进入 Phase 7 删除或收窄路径。

## Delivered Intent Domains

The dated implementation set is preserved here as an archive index rather than as active `spec.md` links:

| Order | Intent domain | Delivered closure |
|---|---|---|
| 1 | `260623-01-phase6-contract-ledger` | Unified the protected-surface contract ledger, current owners, fallback owners, proof gates, and the Phase 7 consumer map, with explicit `JS-Slash-Runner` dependency marking. |
| 2 | `260623-02-phase6-extension-runtime-compatibility-evidence` | Collected `JS-Slash-Runner` primary runtime evidence and the secondary regex / Quick Reply-style / Extensions Manager / mount-point evidence needed to support it. |
| 3 | `260623-03-phase6-global-compatibility-evidence` | Closed the public-global versus internal-bridge evidence for `globalThis.SillyTavern`, `eventSource`, `event_types`, and the allowlisted React compatibility bridge. |
| 4 | `260623-04-phase6-migration-deprecation-rollback-package` | Delivered the migration, deprecation-window, rollback, and breaking-change blocker package that Phase 7 consumed for shell/global decisions. |

## Protected Surfaces

- `globalThis.SillyTavern`
- `eventSource` and `event_types`
- `@sillytavern/*` aliases
- Tavern Helper, JS-Slash-Runner, Regex Manager, Quick Reply, Extensions Manager
- Protected extension mount points inside the workspace and extensions drawer

## Exit Evidence That Phase 6 Delivered

- `JS-Slash-Runner` primary-gate status with explicit blocker language for mount, alias, event, slash, regex, and required globals
- Migration guide and API change log
- Deprecation warning period and rollback package
- `bun run test:compat` passing record
- Global bridge unit proof for the public-global/internal-bridge boundary
- Phase 7 blocker language for any delete/narrowing candidate without replacement, migration note, and rollback

## Validation

```powershell
bun run test:compat
bun run docs:check
```

When the change touched global compatibility evidence, the delivered proof also included:

```powershell
bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand
```
