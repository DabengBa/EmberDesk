import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('legacy setup page controller retirement', () => {
    test('removes the legacy setup controller and HTML page', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'setup.js'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'setup.html'))).toBe(false);
    });

    test('keeps shared setup helpers for the React owner', () => {
        const shared = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'setup-shared.js'), 'utf8');
        expect(shared).toContain('export const setupMessages');
        const helper = fs.readFileSync(path.join(repoRoot, 'app', 'lib', 'setup-helpers.ts'), 'utf8');
        expect(helper).toContain("from '../../public/scripts/setup-shared.js'");
    });
});
