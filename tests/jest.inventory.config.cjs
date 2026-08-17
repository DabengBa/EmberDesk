const path = require('node:path');

module.exports = {
    rootDir: __dirname,
    transform: {},
    testEnvironment: 'node',
    setupFilesAfterEnv: [
        path.join(__dirname, 'helpers', 'jest-phase-probe.cjs'),
    ],
    slowTestThreshold: 1,
};
