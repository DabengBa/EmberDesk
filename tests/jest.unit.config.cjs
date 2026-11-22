module.exports = {
    rootDir: __dirname,
    extensionsToTreatAsEsm: ['.ts'],
    transform: { '^.+\\.ts$': '<rootDir>/helpers/jest-strip-typescript.cjs' },
    moduleNameMapper: {
        '^/react/login/workspace/runtime\\.js$': '<rootDir>/../app/compat/workspace-runtime.ts',
    },
    testEnvironment: 'node',
    slowTestThreshold: 1,
    passWithNoTests: true,
};
