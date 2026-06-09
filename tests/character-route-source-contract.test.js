import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('character route source contract', () => {
    test('keeps rename route response shape stable after command delegation', () => {
        const source = readRepoFile('src/endpoints/characters.js');

        expect(source).toContain('router.post(\'/rename\', validateAvatarUrlMiddleware');
        expect(source).toContain('const result = await renameCharacterCard({');
        expect(source).toContain('return response.send({ avatar: result.avatarName });');
    });
});
