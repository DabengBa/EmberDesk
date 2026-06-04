import js from '@eslint/js';
import jest from 'eslint-plugin-jest';
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';

const playwrightRecommended = playwright.configs['flat/recommended'];

const testRules = {
    'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    'no-control-regex': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
    'require-yield': 'off',
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'indent': ['error', 4, { SwitchCase: 1, FunctionDeclaration: { parameters: 'first' } }],
    'comma-dangle': ['error', 'always-multiline'],
    'eol-last': ['error', 'always'],
    'no-trailing-spaces': 'error',
    'object-curly-spacing': ['error', 'always'],
    'space-infix-ops': 'error',
    'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
    'no-cond-assign': 'error',
    'no-useless-escape': 'off',
    'no-async-promise-executor': 'off',
    'no-inner-declarations': 'off',
    'no-redeclare': ['error', { builtinGlobals: false }],
    'no-useless-assignment': 'off',
    'jest/expect-expect': 'off',
    'jest/no-conditional-expect': 'off',
};

export default [
    {
        ignores: [
            '*.min.js',
            'node_modules/**/*',
        ],
    },
    js.configs.recommended,
    jest.configs['flat/recommended'],
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.jest,
                globalThis: 'readonly',
                SillyTavern: 'readonly',
            },
        },
        settings: {
            jest: {
                version: 29,
            },
        },
        rules: testRules,
    },
    {
        ...playwrightRecommended,
        files: ['**/*.e2e.js'],
        languageOptions: {
            ...playwrightRecommended.languageOptions,
            globals: {
                ...playwrightRecommended.languageOptions.globals,
                ...globals.browser,
            },
        },
        rules: {
            ...playwrightRecommended.rules,
            'playwright/consistent-spacing-between-blocks': 'off',
            'playwright/no-conditional-in-test': 'off',
            'playwright/prefer-hooks-in-order': 'off',
            'playwright/prefer-to-have-length': 'off',
        },
    },
];
