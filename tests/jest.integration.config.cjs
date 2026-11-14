module.exports = {
    rootDir: __dirname,
    extensionsToTreatAsEsm: ['.ts'],
    transform: { '^.+\\.ts$': '<rootDir>/helpers/jest-strip-typescript.cjs' },
    testEnvironment: 'node',
    slowTestThreshold: 1,
    passWithNoTests: true,
};
