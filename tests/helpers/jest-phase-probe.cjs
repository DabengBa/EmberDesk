const fs = require('node:fs');
const path = require('node:path');

const startedAt = performance.now();
const phase = {
    testPath: null,
    transformMs: null,
    importMs: null,
    setupMs: null,
    environmentMs: null,
    testsMs: null,
    teardownMs: null,
};

globalThis.__emberDeskJestPhase = phase;

beforeAll(() => {
    phase.testPath = expect.getState().testPath ?? null;
    phase.importMs = Math.round(performance.now() - startedAt);
});

afterAll(() => {
    const outputDirectory = process.env.JEST_PHASE_REPORT_DIR;
    if (!outputDirectory) {
        return;
    }

    fs.mkdirSync(outputDirectory, { recursive: true });
    const fileName = `${process.pid}-${Math.random().toString(36).slice(2)}.json`;
    fs.writeFileSync(
        path.join(outputDirectory, fileName),
        JSON.stringify(phase, null, 2),
    );
});
