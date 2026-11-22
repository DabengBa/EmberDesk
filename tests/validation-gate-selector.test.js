import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatValidationGateSelection,
    selectValidationGates,
} from '../src/validation-gate-selector.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function commandsFor(inputs) {
    return selectValidationGates(inputs).commands.map(command => command.command);
}

describe('validation gate selector', () => {
    test('selects user validation for the TypeScript migration module', () => {
        expect(selectValidationGates(['src/user-migrations.ts']).commands.map(command => command.id))
            .toEqual(['user-auth-storage']);
    });

    test.each([
        ['src/express-route-compat.ts', ['express-route-order']],
        ['src/storage-feature-flags.ts', ['canonical-storage-rollout']],
        ['src/canonical-sqlite-rollout-contract.ts', ['canonical-storage-rollout']],
        ['src/endpoints/characters.ts', ['express-route-order', 'canonical-storage-rollout']],
        ...['security', 'session', 'pages', 'files', 'backup', 'types'].map(name =>
            [`src/user-${name}.ts`, ['user-auth-storage']]),
    ])('preserves validation suggestions for %s after migration', (input, expected) => {
        expect(selectValidationGates([input]).commands.map(command => command.id)).toEqual(expected);
    });

    test.each(['js', 'ts'])('keeps user storage validation after a .%s migration', extension => {
        expect(selectValidationGates([`src/user-storage.${extension}`]).commands.map(command => command.id))
            .toEqual(['user-auth-storage']);
    });

    test.each(['js', 'ts'])('keeps user directories validation after a .%s migration', extension => {
        expect(selectValidationGates([`src/user-directories.${extension}`]).commands.map(command => command.id))
            .toEqual(['user-auth-storage']);
    });

    test.each([
        ['server-main', ['express-route-order', 'startup-config']],
        ['server-startup', ['startup-config']],
        ['command-line', ['startup-config']],
        ['canonical-sqlite', ['canonical-storage-rollout']],
        ['canonical-sqlite-migrations', ['canonical-storage-rollout']],
        ['canonical-sqlite-export', ['canonical-storage-rollout']],
        ['canonical-sqlite-operator', ['canonical-storage-rollout']],
        ['canonical-storage-slice-registry', ['canonical-storage-rollout']],
    ])('selects the existing gates for migrated and legacy %s paths individually', (basename, expected) => {
        for (const extension of ['js', 'ts']) {
            const input = `src/${basename}.${extension}`;
            const selection = selectValidationGates([input]);
            expect(selection.commands.map(command => command.id)).toEqual(expected);
            for (const command of selection.commands) {
                expect(command.matchedInputs).toEqual([input]);
            }
        }
    });

    test.each(['whitelist', 'hostWhitelist', 'corsProxy'])('keeps the middleware gate for migrated and legacy %s paths', basename => {
        for (const extension of ['js', 'ts']) {
            expect(selectValidationGates([`src/middleware/${basename}.${extension}`]).commands.map(command => command.id))
                .toEqual(['express-route-order']);
        }
    });

    test('does not select migrated exact-path rules for unrelated extensions or names', () => {
        for (const input of [
            'src/server-main.tsx',
            'src/server-main-extra.ts',
            'src/command-line.tsx',
            'src/server-startup.tsx',
            'src/canonical-sqlite.tsx',
            'src/canonical-storage-slice-registry.tsx',
        ]) {
            expect(selectValidationGates([input]).commands).toEqual([]);
        }
    });

    test('maps high-risk touched paths to focused validation gates with local rule sources', () => {
        const result = selectValidationGates([
            'public/scripts/slash-commands.js',
            'src/endpoints/characters.ts',
            'src/canonical-sqlite-operator.ts',
            'src/command-line.ts',
            'src/user-auth.ts',
            'public/lib.js',
            '.docs/db/pages/chat-workspace.md',
            'public/scripts/workspace-panel-host-controller.js',
            'app/workspace-panels.tsx',
        ]);

        expect(result.advisoryOnly).toBe(true);
        expect(result.commands).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'pnpm --dir tests run test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/canonical-sqlite-storage-roadmap.md']),
            }),
            expect.objectContaining({
                command: 'pnpm run test:compat',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/third-party-extension-compatibility.md']),
            }),
            expect.objectContaining({
                command: 'pnpm --dir tests run test:unit -- express5-route-compatibility.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['AGENTS.md']),
            }),
            expect.objectContaining({
                command: 'pnpm --dir tests run test:unit -- command-line.test.js startup-critical-path.test.js startup-loader.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/server-startup-orchestration.md']),
            }),
            expect.objectContaining({
                command: 'pnpm --dir tests run test:unit -- user-auth.test.js user-storage.test.js user-directories.test.js user-migrations.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/user-module-split.md']),
            }),
            expect.objectContaining({
                command: 'pnpm --dir tests run test:unit -- frontend-shared-library-boundary.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/frontend-shared-library-boundary.md']),
            }),
            expect.objectContaining({
                command: 'pnpm run docs:check',
                required: true,
                sources: expect.arrayContaining(['AGENTS.md']),
            }),
            expect.objectContaining({
                command: 'pnpm --dir tests run test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/workspace-shell-panel-dock-coordination.md']),
            }),
            expect.objectContaining({
                command: 'pnpm run build:react:workspace-panels',
                required: false,
                sources: expect.arrayContaining(['.docs/tech/pnpm-workflow.md']),
            }),
        ]));
        expect(result.notes).toContain('Advisory only: final diff review may add or remove validation based on actual changes.');
    });

    test('deduplicates overlapping surfaces without recommending bun test as a Jest replacement', () => {
        const commands = commandsFor([
            'public/scripts/extensions/regex/engine.js',
            'public/scripts/slash-commands.js',
        ]);

        expect(commands).toEqual(['pnpm run test:compat']);
        expect(commands.join('\n')).not.toContain('bun test');
    });

    test('keeps broad surface-name matching from turning unrelated config paths into startup gates', () => {
        expect(selectValidationGates(['vite.config.js']).commands.map(command => command.id)).toEqual([
            'react-workspace-panel-bundle',
        ]);
        expect(selectValidationGates(['tests/playwright.config.js']).commands.map(command => command.id)).toEqual([
            'react-workspace-panel-bundle',
        ]);
        expect(selectValidationGates(['.docs/tech/config-resolution.md']).commands.map(command => command.id)).toEqual([]);
        expect(selectValidationGates(['default/config.yaml']).commands.map(command => command.id)).toEqual([
            'react-workspace-panels',
            'startup-config',
        ]);
    });

    test('formats deterministic advisory output for CLI use', () => {
        const formatted = formatValidationGateSelection(selectValidationGates([
            'scripts/canonical-sqlite-repair.mjs',
            '.docs/db/features/startup-bootstrap.md',
        ]));

        expect(formatted).toContain('Validation Gate Selector (advisory-only)');
        expect(formatted).toContain('[required] pnpm --dir tests run test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand');
        expect(formatted).toContain('[required] pnpm run docs:check');
        expect(formatted).toContain('final diff review may add or remove validation');
    });

    test('selects the canonical rollout gate for repair tooling surfaces', () => {
        const commands = commandsFor([
            'src/canonical-sqlite-rollout-contract.ts',
            'scripts/canonical-sqlite-repair.mjs',
        ]);

        expect(commands).toContain('pnpm --dir tests run test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand');
    });

    test.each(['character-read-service.ts', 'character-write-service.ts', 'character-store.ts'])('selects canonical validation for migrated %s', filename => {
        expect(selectValidationGates([`src/endpoints/${filename}`]).commands.map(command => command.id))
            .toContain('canonical-storage-rollout');
    });

    test('does not select the retired derived-cache helper gate for historical notes', () => {
        const commands = commandsFor([
            '.docs/tech/derived-cache-sqlite.md',
            '.docs/tech/interaction-performance-indexing.md',
            'derived index retirement',
        ]);

        expect(commands).toEqual([]);
    });

    test('formats an empty advisory result defensively', () => {
        const formatted = formatValidationGateSelection();

        expect(formatted).toContain('Validation Gate Selector (advisory-only)');
        expect(formatted).toContain('No focused gates matched');
        expect(formatted).toContain('final diff review may add or remove validation');
    });

    test('CLI accepts path arguments and prints advisory gates without mutating files', () => {
        const output = execFileSync('node', [
            path.join(repoRoot, 'scripts/validation-gate-selector.mjs'),
            'public/scripts/slash-commands.js',
            '.docs/db/pages/chat-workspace.md',
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
        });

        expect(output).toContain('Validation Gate Selector (advisory-only)');
        expect(output).toContain('[required] pnpm run test:compat');
        expect(output).toContain('[required] pnpm run docs:check');
        expect(output).not.toContain('bun test');
    });
});
