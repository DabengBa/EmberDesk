import { defineConfig } from '@playwright/test';

export default defineConfig({
    testMatch: 'chat-memory-panel.e2e.js',
    workers: 1,
    timeout: 15_000,
    use: { headless: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE } },
});
