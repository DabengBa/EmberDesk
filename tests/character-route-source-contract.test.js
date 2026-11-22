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
        const source = readRepoFile('src/endpoints/characters.ts');
        const handlers = readRepoFile('src/endpoints/character-write-routes.ts');

        expect(source).toContain('router.post(\'/rename\', validateAvatarUrlMiddleware');
        expect(source).toContain('router.post(\'/rename\', validateAvatarUrlMiddleware, writeHandlers.rename)');
        expect(handlers).toContain('const result = await renameCharacterCard({');
        expect(handlers).toContain('return response.send({ avatar: result.avatarName, mediaAuthorization: result.mediaAuthorization, settings_revision: result.settingsRevision });');
    });

    test('keeps production route registration and coordination in the facade', () => {
        const source = readRepoFile('src/endpoints/characters.ts');
        const registrations = [...source.matchAll(/router\.post\('([^']+)'/g)].map(match => match[1]);
        expect(registrations).toEqual([
            '/create', '/rename', '/edit', '/edit-avatar', '/edit-attribute', '/merge-attributes',
            '/text-replace/preview', '/text-replace/apply', '/delete-preflight', '/delete',
            '/all', '/list', '/get', '/chats', '/import', '/duplicate', '/export',
        ]);
        expect(source).not.toMatch(/router\.post\([^\n]*async function/);
        expect(source).toContain('coordinateWorkspaceWrite(\'card\', request => request.body?.avatar_url, writeHandlers.edit)');
        expect(source).toContain('router.post(\'/text-replace/apply\', validateAvatarUrlMiddleware, coordinateReplaceIntent(textReplaceHandlers.apply))');
    });
});
