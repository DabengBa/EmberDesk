# SQLite Index Performance A/B

## Intent & Core Flow

Intent: add a repeatable A/B measurement workflow that isolates the performance impact of the SQLite character index against the existing filesystem-backed path without changing user-visible behavior.

Primary actor: an EmberDesk developer or reviewer validating the real benefit and tradeoffs of the character-index slice.

Happy path:

1. The operator runs one interaction-performance command against a controlled dataset profile.
2. The runner executes the same browser scenarios twice on the same machine and same Node runtime:
   - variant A: SQLite character index forced on
   - variant B: SQLite character index forced off
3. The runner alternates variant order across paired trials, captures browser timings plus server-side route metadata, and verifies the expected path actually ran.
4. The runner writes one artifact bundle under `artifacts/interaction-perf/<timestamp>/` with raw samples, summary statistics, and a Markdown comparison.
5. The operator reads the report to answer:
   - how much steady-state gain SQLite provides
   - what first-build / rebuild cost SQLite adds
   - whether `/api/characters/get` gains materially in steady state

## Scope / Out of Scope

In scope now:

- add an internal SQLite force-on / force-off measurement toggle that works inside the same Node runtime
- add a dedicated interaction-performance runner for SQLite A/B comparison
- measure the server/client paths actually affected by the current SQLite index:
  - `POST /api/characters/all`
  - `POST /api/characters/get`
- produce controlled synthetic datasets for repeatable small / medium / large profiles
- emit artifacts and summary statistics suitable for regression review
- verify variant correctness before trusting timing numbers

Out of scope now:

- comparing two different Node builds purely to simulate `node:sqlite` presence vs absence
- measuring unrelated interaction slowness such as world-info list, chat search, message render jank, or startup `APP_READY`
- benchmarking remote VPS + WAN latency as the primary A/B surface
- turning SQLite on/off into a user-facing product setting
- broad database benchmarking beyond the current character-index slice

First shippable slice:

- one local runner that spawns an isolated server, seeds deterministic data, and reports A/B results for the current SQLite-backed character endpoints only

## Edge Rules / Acceptance

Acceptance outcomes:

- The benchmark must compare SQLite on/off inside the same Node runtime.
- The benchmark must not rely on runtime absence of `node:sqlite` as the “off” variant.
- The benchmark must report cold-ish rebuild cost separately from warm steady-state benefit.
- The benchmark must verify that the intended route path actually executed:
  - SQLite-on warm runs must prove indexed route usage
  - SQLite-off runs must prove filesystem fallback usage
- The benchmark must abort or mark the sample invalid if the two variants do not return equivalent functional results for the same scenario.
- The benchmark must randomize or alternate variant order across trial pairs so one side does not always benefit from warmer OS cache.
- The report must surface medians and tail values, not a single anecdotal timing.

Scenario coverage in this slice:

- `characters_all_first_build`
  - measures first list open with no prebuilt SQLite file
  - expected result: SQLite may be slower or equal because it pays index creation/rebuild cost
- `characters_all_warm_repeat`
  - measures repeated character-list open after the index is already available
  - expected result: this is the primary benefit surface
- `characters_get_warm_repeat`
  - measures steady-state full-character reuse through `/api/characters/get`
- `characters_all_after_chat_dirty`
  - measures one reopen after chat-derived aggregates were marked dirty

Failure / recovery rules:

- If dataset seeding fails, the runner stops before timing.
- If a browser run fails to reach the target UI state, the runner records the failure and marks the scenario invalid.
- If route metadata says the wrong variant path executed, the sample is discarded rather than summarized as valid.
- If the payload equivalence check fails between on/off variants for the same scenario, the runner flags the comparison as semantically invalid and does not claim a performance winner.

## Architecture / Constraints

Fit with current repo patterns:

- Reuse the existing artifact convention already used by startup performance:
  - per-run timestamp directory
  - machine-readable `report.json`
  - human-readable `report.md`
  - screenshots / supplemental evidence where useful
- Reuse Playwright-based browser execution rather than inventing a second browser automation stack.
- Reuse the current character-index module boundaries instead of benchmarking deep internals in isolation.

Hard constraints:

- Same machine, same Node runtime, same config, same seed data, and same browser channel for both variants.
- Hold adjacent performance knobs constant during comparison:
  - `performance.lazyLoadCharacters`
  - `performance.useDiskCache`
  - any browser cache mode used by the runner
- Use isolated cloned data roots per paired trial so index files, chat-dirty state, and cache mutations do not leak from one variant into the other.
- Do not treat one-off local results as a universal SLA; the tool should report relative deltas and dispersion, not pretend to produce an absolute truth for every deployment.

Key design choices:

1. Add an internal index-mode override instead of swapping runtimes.
   - Proposed shape: `EMBERDESK_CHARACTER_INDEX_MODE=auto|force_on|force_off`
   - `auto` preserves existing production behavior
   - `force_off` lets the runner benchmark the old filesystem-backed path on the same runtime
   - `force_on` is mainly a test/runner assertion path when `node:sqlite` exists

2. Measure user-visible scenarios, not just raw helper functions.
   - The primary numbers should come from browser-driven panel-open and character-open flows.
   - Server-side route timings and path metadata act as explanation and validation, not the only output.

3. Separate “index creation cost” from “steady-state benefit”.
   - First-build timing and warm-repeat timing answer different questions and must not be merged into one average.

4. Prefer paired alternating trials over fake “cold disk” claims.
   - True OS-level cache flushing is not portable or trustworthy in this repo workflow.
   - The runner should instead alternate variant order across repeated trial pairs and report medians plus spread.

User-visible flow ordering for the runner:

1. seed baseline data
2. choose scenario set and dataset profile
3. create trial pair clones
4. run variant order A/B or B/A
5. perform one warm-up pass per variant/scenario where needed
6. record measured passes only after warm-up rules are satisfied
7. generate comparison report

## Data / Integrations

### Variant control

Implementation target:

- `src/endpoints/character-index.js`

Design:

- `isCharacterIndexSupported()` should honor an internal override mode before the current `node:sqlite` capability check.
- The override is measurement-only and not documented as a user feature.

### Benchmark runner

Implementation target:

- new script under `scripts/`, following the existing `startup-performance-runner.mjs` shape
- new package script, likely `perf:interaction`

Design:

- spawn a local server with:
  - isolated `dataRoot`
  - generated config file
  - explicit index mode env var
  - stable port allocation
- create deterministic dataset profiles, for example:
  - `small`: enough rows to prove correctness but little gain
  - `medium`: realistic day-to-day library
  - `large`: the profile where the index should matter clearly
- each trial pair gets two fresh clones from the same seeded baseline:
  - one for SQLite on
  - one for SQLite off

### Measurement metadata

The runner should collect both browser-visible timings and route-side explanation.

Browser-visible metrics:

- time from “open character panel” trigger to list rendered
- time from “open one character” trigger to full data rendered / available
- request count for the measured flow
- screenshot or DOM-state evidence for the measured state

Server-side explanation metrics:

- route handler duration for `/api/characters/all`
- route handler duration for `/api/characters/get`
- whether the response came from:
  - SQLite indexed path
  - filesystem fallback
- whether the SQLite run performed:
  - rebuild
  - warm hit
  - chat-dirty refresh

Recommended transport for per-request explanation:

- measurement-only response metadata headers, preferably `Server-Timing` plus a small explicit path header
- this keeps the normal JSON contract unchanged while letting Playwright read structured route evidence

### Scenario-specific correctness checks

The runner should compare functional equivalence between variants before trusting timing numbers.

Required checks:

- `/api/characters/all`
  - same row count
  - same avatar ordering
  - same representative summary fields for sampled rows
- `/api/characters/get`
  - same avatar
  - same name
  - same chat summary fields
  - same legacy world-linked derived book state where applicable

### Artifact layout

Output directory:

- `artifacts/interaction-perf/<timestamp>/`

Expected files:

- `report.json`
- `report.md`
- `samples.json`
- `config.json`
- one screenshot per scenario / variant where useful

Summary fields in `report.json` / `report.md`:

- machine timestamp
- dataset profile
- scenario name
- variant order per pair
- warm-up count
- measured run count
- median / p90 / min / max
- relative delta between SQLite on and off
- semantic-validity result
- notable warnings:
  - wrong route path observed
  - rebuild happened during a supposed warm run
  - payload mismatch

### Suggested scenario matrix

Default suite:

1. `characters_all_first_build`
   - baseline data has no SQLite file
   - list opened once
2. `characters_all_warm_repeat`
   - one unmeasured warm-up list open
   - then repeated measured list opens
3. `characters_get_warm_repeat`
   - one unmeasured warm-up `/get`
   - then repeated measured opens for a sampled avatar
4. `characters_all_after_chat_dirty`
   - mark one character dirty through a real chat mutation path
   - measure the next list reopen only

Optional second-phase extension, not required now:

- run the same suite against a user-provided real dataset snapshot after the synthetic suite passes

## Verification

Expected operator commands after implementation:

```bash
npm run perf:interaction -- --profile medium --scenario suite
```

Optional focused runs:

```bash
npm run perf:interaction -- --profile large --scenario characters_all_warm_repeat
npm run perf:interaction -- --profile large --scenario characters_get_warm_repeat
```

Done criteria:

- the runner can execute SQLite on/off comparisons without changing runtimes
- the runner produces an artifact bundle under `artifacts/interaction-perf/<timestamp>/`
- the report clearly distinguishes first-build cost vs warm steady-state benefit
- the report includes proof of which route path actually served each sample
- semantic mismatches invalidate the comparison instead of being silently ignored
- the repo has automated coverage for the new index-mode override and any measurement-only route metadata helpers

Recommended automated validation:

- unit tests for the index-mode override behavior
- focused tests for route metadata emission in measurement mode
- existing `interaction-performance-index.test.js` remains green

Recommended manual validation:

- inspect one artifact bundle and confirm the SQLite-on warm list scenario actually used the indexed path
- inspect the SQLite-off pair and confirm it used the filesystem path
- inspect that `characters_all_first_build` is reported separately from warm-repeat scenarios

## Doc ID Contract

None.

This slice adds internal measurement tooling and implementation notes only. It does not introduce or rename user-visible semantic surfaces, workflows, or terms.

## References

- `src/endpoints/character-index.js`
- `src/endpoints/characters.js`
- `src/endpoints/chats.js`
- `public/script.js`
- `scripts/startup-performance-runner.mjs`
- `src/server-startup-profiler.js`
- `src/performance-report.js`
- `tests/interaction-performance-index.test.js`
- `tests/performance-report.test.js`
- `tests/server-startup-profiler.test.js`
- `docs/interaction-performance.md`
- `docs/startup-performance.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/project-overview.md`
- `package.json`
- Inference: the repo already preserves `artifacts/interaction-perf/<timestamp>/` run folders, so the new runner should reuse that artifact family instead of inventing a second naming convention.
