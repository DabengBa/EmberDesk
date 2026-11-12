import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: 'isolated-character-library-cleanup.case.js',
    workers: 1,
    reporter: 'line',
});
