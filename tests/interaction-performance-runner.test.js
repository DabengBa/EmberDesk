import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';

const runner = fileURLToPath(new URL('../scripts/interaction-performance-runner.mjs', import.meta.url));

describe('interaction benchmark variant selection', () => {
    test('defaults to the single canonical variant', () => {
        const result = spawnSync(process.execPath, [runner, '--list-scenarios'], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout).variantSelection).toBe('sqlite_on_only');
    });

    test.each(['ab', 'sqlite_off_only', 'unknown'])('rejects retired or unknown variant %s', variant => {
        const result = spawnSync(process.execPath, [runner, '--variant', variant, '--list-scenarios'], { encoding: 'utf8' });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Only sqlite_on_only is supported');
    });
});
