import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('unified character import confirmation dialog', () => {
    test('Import All selects every option and submits the dialog', () => {
        const source = read('public/scripts/import-confirm-dialog.js');
        const importAllButtonStart = source.indexOf('text: t`Import All`');
        const importAllButtonEnd = source.indexOf('}],', importAllButtonStart);
        const importAllButtonSource = source.slice(importAllButtonStart, importAllButtonEnd);

        expect(importAllButtonStart).toBeGreaterThanOrEqual(0);
        expect(importAllButtonEnd).toBeGreaterThan(importAllButtonStart);
        expect(importAllButtonSource).toContain('result: POPUP_RESULT.AFFIRMATIVE');
        expect(importAllButtonSource).toContain('cb.checked = true');
        expect(importAllButtonSource).toContain('importAllChoices = {');
    });
});
