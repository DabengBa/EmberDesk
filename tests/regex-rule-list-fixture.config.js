import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ testDir: root, testMatch: 'regex-rule-list-component.e2e.js', outputDir: path.resolve(root, 'test-results/regex-component'), reporter: 'list', workers: 1 });
