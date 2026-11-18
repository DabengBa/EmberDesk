import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const port = process.env.PLAYWRIGHT_PORT ?? '8000';
const baseURL = `http://127.0.0.1:${port}`;
const dataRoot = process.env.PLAYWRIGHT_DATA_ROOT ?? '.tmp/playwright-workspace-data';
const configPath = process.env.PLAYWRIGHT_CONFIG_PATH ?? '.tmp/playwright-workspace-config.yaml';

// The lane prepares artifacts separately and can exercise HTTP before the build exists.
export default defineConfig({
    testMatch: 'workspace-spa-entry.e2e.js',
    outputDir: path.join(process.env.TMPDIR ?? '.tmp', 'workspace-spa-entry-results'),
    webServer: {
        command: [
            `node scripts/seed-dev-environment.mjs --data-root "${dataRoot}" --config "${configPath}" --user-handle "${process.env.PLAYWRIGHT_USER ?? 'playwright-e2e'}" --user-password "${process.env.PLAYWRIGHT_PASSWORD ?? 'playwright'}"`,
            `node server.js --configPath "${configPath}" --port ${port}`,
        ].join(' && '),
        cwd: repoRoot,
        url: `${baseURL}/csrf-token`,
        timeout: 120_000,
    },
    use: {
        baseURL,
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE || undefined },
    },
});
