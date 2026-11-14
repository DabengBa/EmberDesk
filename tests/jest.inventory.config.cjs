const path = require('node:path');

module.exports = {
    rootDir: __dirname,
    extensionsToTreatAsEsm: ['.ts'],
    transform: { '^.+\\.ts$': '<rootDir>/helpers/jest-strip-typescript.cjs' },
    testEnvironment: 'node',
    setupFilesAfterEnv: [
        path.join(__dirname, 'helpers', 'jest-phase-probe.cjs'),
    ],
    slowTestThreshold: 1,
};
