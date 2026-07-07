import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatValidationGateSelection,
    selectValidationGates,
} from '../src/validation-gate-selector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function commandsFor(inputs) {
    return selectValidationGates(inputs).commands.map(command => command.command);
}

describe('validation gate selector', () => {
    test('maps high-risk touched paths to focused validation gates with local rule sources', () => {
        const result = selectValidationGates([
            'public/scripts/slash-commands.js',
            'src/endpoints/characters.js',
            'src/canonical-sqlite-operator.js',
            'src/command-line.js',
            'src/user-auth.js',
            'src/derived-cache-sqlite.js',
            'public/lib.js',
            '.docs/db/pages/chat-workspace.md',
            'public/scripts/workspace-panel-host-controller.js',
            'app/workspace-panels.tsx',
        ]);

        expect(result.advisoryOnly).toBe(true);
        expect(result.commands).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'bun run --cwd tests test:unit -- canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/adr/0011-canonical-per-user-sqlite-storage.md']),
            }),
            expect.objectContaining({
                command: 'bun run test:compat',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/third-party-extension-compatibility.md']),
            }),
            expect.objectContaining({
                command: 'bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['AGENTS.md']),
            }),
            expect.objectContaining({
                command: 'bun run --cwd tests test:unit -- command-line.test.js startup-critical-path.test.js startup-loader.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/modernization-roadmap.md']),
            }),
            expect.objectContaining({
                command: 'bun run --cwd tests test:unit -- user-auth.test.js user-storage.test.js user-directories.test.js user-migrations.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/adr/0003-user-account-module-split.md']),
            }),
            expect.objectContaining({
                command: 'bun run --cwd tests test:unit -- derived-cache-sqlite.test.js character-read-service.test.js interaction-performance-index.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/adr/0009-derived-cache-sqlite-drizzle-decision.md']),
            }),
            expect.objectContaining({
                command: 'bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/frontend-shared-library-boundary.md']),
            }),
            expect.objectContaining({
                command: 'bun run docs:check',
                required: true,
                sources: expect.arrayContaining(['AGENTS.md']),
            }),
            expect.objectContaining({
                command: 'bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js --runInBand',
                required: true,
                sources: expect.arrayContaining(['.docs/tech/react-modernization-roadmap.md']),
            }),
            expect.objectContaining({
                command: 'bun run build:react:workspace-panels',
                required: false,
                sources: expect.arrayContaining(['.docs/tech/bun-workflow.md']),
            }),
        ]));
        expect(result.notes).toContain('Advisory only: final diff review may add or remove validation based on actual changes.');
    });

    test('deduplicates overlapping surfaces without recommending bun test as a Jest replacement', () => {
        const commands = commandsFor([
            'public/scripts/extensions/regex/engine.js',
            'public/scripts/slash-commands.js',
        ]);

        expect(commands).toEqual(['bun run test:compat']);
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
        expect(formatted).toContain('[required] bun run --cwd tests test:unit -- canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand');
        expect(formatted).toContain('[required] bun run docs:check');
        expect(formatted).toContain('final diff review may add or remove validation');
    });

    test('selects the canonical rollout gate for repair tooling surfaces', () => {
        const commands = commandsFor([
            'src/canonical-sqlite-rollout-contract.js',
            'scripts/canonical-sqlite-repair.mjs',
        ]);

        expect(commands).toContain('bun run --cwd tests test:unit -- canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand');
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
        expect(output).toContain('[required] bun run test:compat');
        expect(output).toContain('[required] bun run docs:check');
        expect(output).not.toContain('bun test');
    });
});
