---
created: 2026-06-16
source: user
confirmed: true
last_updated: 2026-06-18
---

# React Settings Entry Intent

## User Original Request

用户要求继续推进 React Phase 1 Sprint 3 Settings 入口交付，并明确这个 Sprint 讨论的不是把 `World Info`、`Backgrounds`、`Extensions` 混进来，而是把当前分散的设置相关能力收口成可迁移的 React 设置入口。

用户随后明确要求路线图和该 Sprint 都要严格推动 `TanStack Form`、`TanStack Query`、`Zod` 的采用。

## Background & Motivation

当前 EmberDesk 并不存在一个已经独立成页的 `Settings` 页面。设置能力分散在多个 legacy drawers 中，字段边界不清，前端状态和 provider 密钥逻辑也混在旧实现里。用户希望在 React 现代化 Phase 1 里，先把设置内容收口成一个明确边界、可灰度、可回退的统一入口。

## Intent Domains

### Domain: 统一 React 设置入口

- **User expectation:** 提供一个由 React 拥有的统一设置入口，覆盖 `User Settings`、`API Connections`、`Advanced Formatting` 和 `AI Response Configuration` 的设置子集，而不是继续扩散在多个 legacy 面板中
- **Current status:** delivered
- **Change history:**
  - 2026-06-16: 用户确认 Sprint 3 需要补足“settings-panel 到底是什么”的定义，并同意把它明确为新的 React 设置入口
  - 2026-06-16: 用户确认 `World Info`、`Backgrounds`、`Extensions` 不应混入本 Sprint，并要求把这些边界回写到 roadmap
  - 2026-06-18: React `/settings` 已交付为 feature-flagged 独立入口，覆盖 General、Providers、User Interface、Advanced 的 Sprint 3 设置切片，并保留 legacy `/` fallback
- **Implementation traceability:** code paths `src/react-settings-feature.js`, `src/users.js`, `src/server-main.js`, `app/routes/settings.tsx`, `app/components/settings/*`, `app/lib/settings-helpers.js`, `public/scripts/provider-secret-field-state.js`; tests `tests/settings-react-route.test.js`, `tests/provider-secret-field-state.test.js`, `tests/secrets-input-map.test.js`; owning docs `.docs/db/pages/settings.md`, `.docs/db/pages/api-configuration.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/react-modernization-roadmap.md`; commit `this wrap-up commit`; delivery status `delivered`

### Domain: 严格采用 TanStack Form / Query / Zod

- **User expectation:** 登录、setup、settings 的 React 化路线必须显式推动 TanStack Form、TanStack Query、Zod，而不是沿用临时本地 state 或 ad hoc fetch
- **Current status:** delivered
- **Change history:**
  - 2026-06-16: 用户质疑路线图里 “未采用 TanStack Form + Zod / TanStack Query” 的表述，并明确要求严格推动三者采用
  - 2026-06-16: Sprint 3 spec 已回写为必须使用 TanStack Form + Zod + TanStack Query
  - 2026-06-18: Sprint 3 实现和路线图均已收口到 TanStack Form + Zod + TanStack Query；后续 React 页面迁移默认以该组合为采用门槛
- **Implementation traceability:** code paths `app/routes/settings.tsx`, `app/lib/settings-helpers.js`, `tests/settings-react-route.test.js`; roadmap `.docs/tech/react-modernization-roadmap.md`; semantic doc `.docs/db/pages/settings.md`; commit `this wrap-up commit`; delivery status `delivered`

## Non-Goals

- 本 Sprint 不迁移 `World Info`、`Backgrounds`、`Extensions`、`Persona Management`
- 本 Sprint 不修改 `/api/settings/*`、`/api/secrets/*` 的后端 URL 契约
- 本 Sprint 不重写主聊天工作区 shell 或要求一次性交接所有 legacy power-user 字段
