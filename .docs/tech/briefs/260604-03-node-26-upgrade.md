# Brief: Node.js 26 Upgrade

## Original Request

制定升级到 Node.js 26.3 的计划

## Background

请求提出时，项目运行在 Node.js 24 LTS (`>=24 <25`)；用户希望升级到 Node.js 26 Current (v26.3.0)。

## Confirmed Facts

- 请求提出时的 runtime 合约: Node.js 24 Active LTS (`>=24 <25`)
- 目标版本: Node.js 26.3.0 (Current)
- Node.js 26 将于 2026 年 10 月进入 LTS
- 项目无 native dependencies / node-gyp
- 项目代码未使用 Node.js 26 移除的 API (`writeHeader`, `_stream_*`, `experimental-transform-types`, `module.register`, `localStorage`)

## Confirmed Decisions

- 升级时机: 现在升级到 Current，不等待 LTS
- Bun 版本: 保持 1.3.14 不变
- 运行时合约: Node.js 26.3.0 Current (`>=26.3.0 <27`)

## Implementation Traceability

| Intent Domain | Delivered Path | Status |
|---|---|---|
| Runtime contract | `package.json`, `bun.lock` | Delivered: root `engines.node` is `>=26.3.0 <27`; direct `@types/node` is `^25.9.1` because `@types/node@26` was not published on 2026-06-04. |
| Container proof | `Dockerfile` | Delivered: runtime base image is pinned to `node:26.3.0-alpine3.23`; Docker version check returned `v26.3.0`; Docker build passed. |
| CI runtime proof | `.github/workflows/pr-checks.yml`, `.github/workflows/npm-publish.yml` | Delivered: all targeted setup-node calls use `node-version: 26.3.0`; npm publish setup-node pin is v4.3.0. |
| Runtime documentation | `README.md`, `AGENTS.md`, `.agents/skills/emberdesk-local-dev/SKILL.md`, `.agents/skills/emberdesk-testing-debugging/SKILL.md`, `.docs/project-overview.md`, `.docs/tech/bun-workflow.md`, modernization docs | Delivered: current runtime guidance names Node.js 26.3.0 Current and keeps Bun 1.3.14 as package manager/script runner. |
| Durable history | `.docs/PROJECT_HISTORY.md` | Delivered: project history records the 2026-06-04 Node 26.3.0 runtime contract. |

## Unresolved Questions

无。

## Change History

- 2026-06-04: 初始创建
- 2026-06-04: 交付完成；运行时、Docker、CI、锁文件和文档合约已迁移到 Node.js 26.3.0 Current。
