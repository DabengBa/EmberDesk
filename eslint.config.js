import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

const ignoredPaths = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    'public/lib/**',
    'backups/**',
    'data/**',
    'cache/**',
    'src/tokenizers/**',
    'docker/**',
    'plugins/**',
    '**/*.min.js',
    'public/scripts/extensions/third-party/**',
    'public/scripts/extensions/quick-reply/lib/**',
    'public/scripts/extensions/tts/lib/**',
];

const baseRules = {
    'jsdoc/no-undefined-types': ['warn', { disableReporting: true, markVariablesAsUsed: true }],
    'no-unused-vars': ['error', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^(SlashCommandAbortController|SlashCommandDebugController|SlashCommandScope)$',
    }],
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
    'no-unneeded-ternary': 'error',
    'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    'dot-notation': ['error', { allowPattern: '[A-Z]\\w*$' }],
    'no-async-promise-executor': 'off',
    'no-inner-declarations': 'off',
    'no-constant-binary-expression': 'off',
    'no-unassigned-vars': 'off',
    'no-unused-private-class-members': 'off',
    'no-useless-assignment': 'off',
    'preserve-caught-error': 'off',
    'brace-style': ['error', '1tbs', { allowSingleLine: true }],
    'array-bracket-spacing': ['error', 'never'],
    'computed-property-spacing': ['error', 'never'],
    'block-spacing': ['error', 'always'],
    'keyword-spacing': ['error', { before: true, after: true }],
    'space-before-blocks': ['error', 'always'],
    'space-before-function-paren': ['error', { anonymous: 'always', named: 'never', asyncArrow: 'always' }],
    'space-in-parens': ['error', 'never'],
    'comma-spacing': ['error', { before: false, after: true }],
    'key-spacing': ['error', { beforeColon: false, afterColon: true }],
    'func-call-spacing': ['error', 'never'],
    'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 0 }],
    'padded-blocks': ['error', 'never'],
    'no-whitespace-before-property': 'error',
    'space-unary-ops': ['error', { words: true, nonwords: false }],
    'arrow-spacing': ['error', { before: true, after: true }],
    'template-curly-spacing': ['error', 'never'],
    'rest-spread-spacing': ['error', 'never'],
    'generator-star-spacing': ['error', { before: false, after: true }],
    'yield-star-spacing': ['error', { before: false, after: true }],
    'template-tag-spacing': ['error', 'never'],
    'switch-colon-spacing': ['error', { after: true, before: false }],
};

const baseLanguageOptions = {
    ecmaVersion: 'latest',
};

export default [
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
    },
    {
        ignores: ignoredPaths,
    },
    js.configs.recommended,
    {
        plugins: {
            jsdoc,
        },
        languageOptions: baseLanguageOptions,
        rules: baseRules,
    },
    {
        files: ['src/**/*.js', './*.js'],
        languageOptions: {
            ...baseLanguageOptions,
            sourceType: 'module',
            globals: {
                ...globals.node,
                globalThis: 'readonly',
                Deno: 'readonly',
            },
        },
    },
    {
        files: ['*.cjs'],
        languageOptions: {
            ...baseLanguageOptions,
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
    {
        files: ['src/**/*.mjs'],
        languageOptions: {
            ...baseLanguageOptions,
            sourceType: 'module',
            globals: globals.node,
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            ...baseLanguageOptions,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.jquery,
                globalThis: 'readonly',
                ePub: 'readonly',
                pdfjsLib: 'readonly',
                toastr: 'readonly',
                SillyTavern: 'readonly',
            },
        },
    },
];
