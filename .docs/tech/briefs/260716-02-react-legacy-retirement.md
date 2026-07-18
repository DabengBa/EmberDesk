---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
status: approved
---

# React Migrated-Surface Legacy Retirement

Created: 2026-07-16
Status: approved successor program

## Goal Result

For every surface that has already entered the React migration program, React becomes the only runtime implementation. The old UI, hidden DOM host, action bridge, feature-flag fallback, and legacy runtime owner are deleted after React supplies the same user outcome.

This is not a visual cleanup. It is a full behavior-owner replacement with no user-visible workflow regression and no loss of supported extension or automation behavior.

## Confirmed Constraints

- Users keep the same entry points, key workflows, and results. This program is not permission to redesign the product experience.
- Supported extensions, scripts, slash commands, regex workflows, public browser imports, events, and stable selectors remain usable. Their implementation may be rewritten.
- A prior deployed version is the rollback mechanism. The released version does not keep the old runtime as an in-product fallback.
- Do not expand this program to surfaces that have not already migrated to React, and do not introduce `/workspace-next` or a broad full-SPA rewrite.
- User-data, API, security, and storage authority contracts remain unchanged unless their own owning work explicitly changes them.

## Acceptance Standard

A surface is complete only when:

1. React alone owns its visible behavior and action flow.
2. The equivalent legacy runtime, hidden host, fallback flag, and import/mount branch are removed.
3. Semantic workflows, supported compatibility contracts, accessibility, and performance gates pass.
4. Release documentation describes the new sole owner; it does not advertise a fallback that no longer exists.

## Sequenced Scope

| order | surface | current evidence | retirement condition |
|---|---|---|---|
| 1 | Login and Setup | independent React routes with matching form flows | prove full route parity, remove page flags and `*.html` fallback routing |
| 2 | Character Library; Character and Group Authoring | React list/forms and state foundations are present | replace legacy tag, row-selector, save, and dialog behavior without narrowing extension contracts |
| 3 | Settings; World Info; Background Library; Extensions Host | React UI/action hosts exist, but key behavior still routes through legacy facades | move behavior kernels behind React-owned service contracts, then remove facades and protected legacy hosts only after compatibility proof |
| 4 | Same-entry Workspace Shell and Main Chat | React shell/layout, composer, safe rows, and selected transport foundations exist | replace drawer/control coordination, all request families, streaming/edit/unsafe rows, load-more, and supported extension behavior with performance proof |
| cross-cutting | Public extension and automation contracts | `eventSource`, aliases, globals, selector contracts, and slash/regex behavior are established | preserve behavior through explicit React-era contracts before deleting any legacy implementation that supplies it |

## Non-Goals

- No feature loss to accelerate cleanup.
- No user-visible interaction redesign bundled into retirement work.
- No claim that a guarded React host is already a full replacement.
- No broad framework, backend, storage, or route migration disguised as legacy deletion.

## Implementation Spec Program

The approved direction is decomposed into the following delivery sequence:

1. `react-login-setup-retirement`
2. `react-compatibility-contract-baseline`
3. `react-character-library-retirement`
4. `react-character-group-authoring-retirement`
5. `react-settings-retirement`
6. `react-world-info-retirement`
7. `react-background-library-retirement`
8. `react-extensions-host-retirement`
9. `react-main-chat-transport-retirement`
10. `react-main-chat-renderer-retirement`
11. `react-workspace-shell-retirement`

The sequence is dependency-bearing: the compatibility baseline precedes extension-sensitive panel work; Main Chat transport precedes final renderer ownership; Workspace Shell retires only after all panel and Main Chat owners no longer depend on legacy drawer or runtime coordination.

## Change History

- 2026-07-16: Product confirmed full React owner replacement, user-workflow parity, and preservation of supported extension/automation behavior. This supersedes the former strategy of retaining legacy fallbacks as the final state; see [ADR-0012](../../adr/0012-react-migrated-surface-legacy-retirement.md).
- 2026-07-16: Split the approved program into eleven implementation packages ordered by deletion readiness and dependency.
