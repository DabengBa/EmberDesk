import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('retired group authoring facade', () => {
    test('has no browser authoring implementation', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'group-authoring.js'))).toBe(false);
    });
});
