import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';
import {
    shouldBuildCharacterLibraryPanel,
    shouldBuildWorkspacePanels,
} from './helpers/workspace-react-playwright-flags.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '8000'}`;
const port = new URL(baseURL).port || '80';
const dataRoot = process.env.PLAYWRIGHT_DATA_ROOT ?? '.tmp/playwright-e2e-data';
const configPath = process.env.PLAYWRIGHT_CONFIG_PATH ?? '.tmp/playwright-e2e-config.yaml';
const testUser = process.env.PLAYWRIGHT_USER ?? 'playwright-e2e';
const testPassword = process.env.PLAYWRIGHT_PASSWORD ?? 'playwright';
const chromeExecutablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || undefined;
const shouldReuseExistingServer = !process.env.CI
    && process.env.PLAYWRIGHT_REUSE_SERVER !== '0';
const webServerCommand = [
    shouldBuildCharacterLibraryPanel(process.env) ? 'pnpm run build:react:character-library' : null,
    shouldBuildWorkspacePanels(process.env) ? 'pnpm run build:react:workspace-panels' : null,
    `node scripts/seed-dev-environment.mjs --data-root "${dataRoot}" --config "${configPath}" --user-handle "${testUser}" --user-password "${testPassword}"`,
    `node server.js --configPath "${configPath}" --port ${port}`,
].filter(Boolean).join(' && ');

process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
    testMatch: '*.e2e.js',
    webServer: {
        command: webServerCommand,
        cwd: repoRoot,
        url: baseURL,
        reuseExistingServer: shouldReuseExistingServer,
        timeout: 120_000,
    },
    use: {
        baseURL,
        launchOptions: chromeExecutablePath ? { executablePath: chromeExecutablePath } : undefined,
        video: 'only-on-failure',
        screenshot: 'only-on-failure',
    },
    workers: 4,
    fullyParallel: true,
});
