# React Phase 6: Extension Compatibility Evidence

Status: active evidence phase
Owner doc: [React modernization roadmap](../../tech/react-modernization-roadmap.md)

## Purpose

Phase 6 is an evidence and maintenance phase. It does not delete compatibility surfaces. It prepares the proof Phase 7 needs before deleting, freezing, or long-term supporting extension-facing APIs.

## Scope

- Maintain compatibility exports for at least one deprecation window.
- Validate high-risk extensions and protected surfaces.
- Publish migration guidance and deprecation warnings where needed.
- Feed Phase 7 Sprint 4 and Sprint 7 with evidence.

## Priority Rule

Phase 6 的 primary compatibility gate 是 `JS-Slash-Runner`。

- 任何会影响 `JS-Slash-Runner` import、mount、event、slash-command、regex 或相关 global/export surface 的变更，默认视为高优先级兼容风险。
- 其他扩展如 Quick Reply、Extensions Manager、Regex Manager 作为次级证据面，仅在它们能补充 `JS-Slash-Runner` 未覆盖的风险时进入同批验证。
- 若某个 breaking candidate 会破坏 `JS-Slash-Runner` 且没有明确替代路径、迁移说明和回滚方案，则该 candidate 不得进入 Phase 7 删除或收窄路径。

## Delivered Intent Domains

Phase 6 的 durable intent 和交付追溯收口在 [react-phase6-extension-compat-sequenced-specs](../../tech/briefs/react-phase6-extension-compat-sequenced-specs.md)。

2026-06-23 这组 Phase 6 specs 已完成交付并在 wrap-up 中归档，下面保留的是按最小依赖收敛的 intent-domain 顺序，而不是长期保留的 process links：

| Order | Intent domain | Purpose |
|---|---|---|
| 1 | `260623-01-phase6-contract-ledger` | 统一 protected surfaces、owner、proof、fallback 和 Phase 7 consumer 的 contract ledger，并标明哪些 surface 是 `JS-Slash-Runner` 直接依赖。 |
| 2 | `260623-02-phase6-extension-runtime-compatibility-evidence` | 以 `JS-Slash-Runner` 为 primary gate，收敛其运行时兼容证据，并把 regex、Quick Reply-style usage、Extensions Manager flow 和 protected mount-point lifecycle 作为次级补充证据。 |
| 3 | `260623-03-phase6-global-compatibility-evidence` | 收敛 `globalThis.SillyTavern`、`eventSource`、`event_types` 与 allowlisted React compatibility bridge 的证据，并优先记录 `JS-Slash-Runner` 的直接消费关系。 |
| 4 | `260623-04-phase6-migration-deprecation-rollback-package` | 整理 migration guide、deprecation window、rollback plan 和 breaking-change compatibility review，并把 `JS-Slash-Runner` 影响作为进入 Phase 7 的硬门。 |

依赖规则：
- Spec 1 是其余所有 Phase 6 specs 的基线。
- Spec 2 主要服务 Phase 7 Sprint 4。
- Spec 3 主要服务 Phase 7 Sprint 7。
- Spec 4 汇总 Spec 2 和 Spec 3 的结果，形成最终 Phase 7 决策输入。

## Protected Surfaces

- `globalThis.SillyTavern`
- `eventSource` and `event_types`
- `@sillytavern/*` aliases
- Tavern Helper, JS-Slash-Runner, Regex Manager, Quick Reply, Extensions Manager
- Protected extension mount points inside the workspace and extensions drawer

## Exit Evidence Required Before Phase 7

- Common extension validation checklist.
- `JS-Slash-Runner` primary-gate status with explicit blocker language for mount, alias, event, slash, regex, and required globals.
- Migration guide and API change log.
- Deprecation warning period.
- User rollback plan.
- `bun run test:compat` passing record.
- ADR or compatibility review for each breaking change candidate.

Primary durable owner doc: [Third-Party Extension Compatibility](../../tech/third-party-extension-compatibility.md)

## Validation

```powershell
bun run test:compat
bun run docs:check
```

When the change touches global compatibility evidence, also run:

```powershell
bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand
```
