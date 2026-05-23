# AGENTS.md

> Instructions for AI agents working on the EmberDesk codebase.

## Project Overview

EmberDesk is a fork of [SillyTavern](https://github.com/SillyTavern/SillyTavern), an LLM frontend for power users. The project aims to:

1. **Simplify** -- remove unused or overly complex features from the SillyTavern codebase
2. **Optimize** -- improve performance, reduce bundle size, and streamline server-side logic
3. **Modernize** -- progressively migrate to a modern technology stack

The codebase is in an **early transition stage**. Much of the original SillyTavern code remains and will be iteratively refactored.

## Tech Stack (Current)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24 LTS (`>=24 <25`) |
| Language | JavaScript (ES modules) |
| Server | Express.js |
| Frontend | HTML / CSS / jQuery (no framework yet) |
| Build | Webpack (client-side libs) |
| Entry Point | `server.js` -> `src/server-main.js` |
| License | AGPL-3.0 |

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `release` | Upstream SillyTavern release (reference only) |
| `csp-dev` | Main EmberDesk development branch |
| `csp-dev-init` | Initial setup, documentation, and project scaffolding |

## Working Guidelines

### Code Changes

- **Prefer deletion over addition.** When a feature can be removed or simplified, do so.
- **Avoid over-engineering.** Keep solutions minimal and focused.
- **Preserve existing functionality** unless explicitly asked to remove it.
- **Test before committing.** Ensure the server starts and basic flows work.
- **Write in JavaScript (ES modules).** Do not introduce TypeScript for application code.

### Commit Messages

Use concise, descriptive commit messages. Prefix with a category when relevant:

- `feat:` -- new feature
- `fix:` -- bug fix
- `refactor:` -- code restructuring without behavior change
- `perf:` -- performance improvement
- `docs:` -- documentation only
- `chore:` -- tooling, config, or cleanup

### Architecture Awareness

- `server.js` is the entry point; it bootstraps `src/server-main.js`.
- `public/` contains all client-side code (HTML, CSS, JS).
- `src/` contains server-side modules.
- `default/` holds default configuration and scaffold files.
- The frontend is jQuery-based with no SPA framework. Be cautious with frontend changes.
- Long-form upgrade plans live under `docs/specs/`; keep this file as a concise index.

### Things to Avoid

- Do not introduce React, Vue, or other SPA frameworks without explicit approval.
- Do not modify the `release` branch directly.
- Do not add dependencies without justification.
- Do not change the license.
