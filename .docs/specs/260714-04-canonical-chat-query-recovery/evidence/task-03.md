# Task 3 Evidence

- Local runtime check: `node --version`
  returned `v24.16.0`, which does not satisfy the repo's release-proof contract.
- Node 26 release proof therefore ran in Docker with the contract runtime and Bun runner:
  `docker run --rm -v "$PWD:/work" -w /work node:26.3.0-alpine3.23 sh -lc "npm install -g bun@1.3.14 >/tmp/npm-bun.log 2>&1 && node --version && bun run --cwd tests test:unit -- canonical-chat-query.test.js canonical-chat-backup-restore.test.js --runInBand"`
  returned `v26.3.0` and passed 4 focused tests.
- Deterministic fixed-scale benchmark:
  `docker run --rm -v "$PWD:/work" -w /work node:26.3.0-alpine3.23 sh -lc "npm install -g bun@1.3.14 >/tmp/npm-bun.log 2>&1 && node scripts/canonical-chat-node26-benchmark.mjs --out .docs/specs/260714-04-canonical-chat-query-recovery/evidence/task-03-node26-benchmark.json"`
  produced the following Node 26.3.0 results at fixture scale `12 characters x 3 chats x 180 messages`, with all thresholds passing:
  - `search`: `1.678ms` (threshold `50ms`)
  - `recent`: `1.655ms` (threshold `35ms`)
  - `save`: `8.078ms` (threshold `25ms`)
  - `concurrentReadTotal` for `8` reads: `2.459ms` (threshold `30ms`)
  - `backup`: `1.602ms` (threshold `20ms`)
- Summary: release-proof validation is now reproducible under the contract runtime even
  though this workstation's default `node` is still Node 24. The benchmark script fixes the
  scale, captures thresholds in code, and fails if the runtime drifts from Node 26.3.0 or
  the measured operations regress past the recorded limits.
- Artifact paths:
  - `scripts/canonical-chat-node26-benchmark.mjs`
  - `.docs/specs/260714-04-canonical-chat-query-recovery/evidence/task-03-node26-benchmark.json`
