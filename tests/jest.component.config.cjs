module.exports = {
    rootDir: __dirname,
    transform: {},
    // No DOM-backed Jest component tests exist yet; keep non-UI execution on node.
    testEnvironment: 'node',
    testMatch: ['<rootDir>/__emberdesk_component_tests__/**/*.test.js'],
    slowTestThreshold: 1,
    passWithNoTests: true,
};
