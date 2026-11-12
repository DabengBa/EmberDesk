import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'regex-editor-component.e2e.js', reporter: 'list', workers: 1 });
