import { expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedNodeVersion = '24.16.0';

test('pins the application runtime to Node 24.16.0', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
    const agents = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    const overview = fs.readFileSync(path.join(repoRoot, '.docs', 'project-overview.md'), 'utf8');
    const pnpmWorkflow = fs.readFileSync(path.join(repoRoot, '.docs', 'tech', 'pnpm-workflow.md'), 'utf8');

    expect(packageJson.engines.node).toBe(`>=${expectedNodeVersion} <25`);
    expect(dockerfile).toContain(`FROM node:${expectedNodeVersion}-alpine3.23`);
    expect(agents).toContain(`Node.js ${expectedNodeVersion}`);
    expect(readme).toContain(`Node.js ${expectedNodeVersion}`);
    expect(overview).toContain(`Node.js ${expectedNodeVersion}`);
    expect(pnpmWorkflow).toContain(`Node.js ${expectedNodeVersion}`);
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'canonical-chat-node24-benchmark.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'canonical-chat-node26-benchmark.mjs'))).toBe(false);
});

test('removes obsolete Hono and Webpack stacks', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');

    expect(packageJson.dependencies).not.toHaveProperty('hono');
    expect(packageJson.dependencies).not.toHaveProperty('webpack');
    expect(packageJson.scripts).not.toHaveProperty('build:lib:webpack');
    expect(fs.existsSync(path.join(repoRoot, 'webpack.config.js'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'src', 'middleware', 'webpack-serve.js'))).toBe(false);
    expect(dockerfile).toContain('pnpm run build:lib');
});

test('keeps generated artifacts out of the Docker build context', () => {
    const dockerignore = fs.readFileSync(path.join(repoRoot, '.dockerignore'), 'utf8');

    expect(dockerignore).toMatch(/^\/artifacts$/m);
    expect(dockerignore).toMatch(/^\/\.tmp$/m);
});
