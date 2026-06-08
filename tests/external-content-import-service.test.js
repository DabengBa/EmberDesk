import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { describe, expect, jest, test } from '@jest/globals';

import { setConfigFilePath } from '../src/util.js';
import {
    classifyExternalContentId,
    classifyExternalContentUrl,
    downloadExternalAsset,
    downloadExternalContentArtifact,
    fetchExternalResource,
    getHostFromUrl,
    isHostWhitelisted,
    validateExternalAssetUrl,
} from '../src/endpoints/external-content-import-service.js';

async function getExternalContentDownloaders() {
    setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));
    return (await import('../src/endpoints/content-manager.js')).EXTERNAL_CONTENT_DOWNLOADERS;
}

function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function createResponse({
    ok = true,
    status = 200,
    statusText = 'OK',
    body = { pipe: jest.fn() },
    url = 'https://example.test/file.png',
    contentType = 'image/png',
    jsonBody = { ok: true },
    textBody = 'response text',
    buffer = Buffer.from('payload'),
} = {}) {
    return {
        ok,
        status,
        statusText,
        url,
        body,
        headers: {
            get: key => key.toLowerCase() === 'content-type' ? contentType : null,
        },
        text: jest.fn(async () => textBody),
        json: jest.fn(async () => jsonBody),
        arrayBuffer: jest.fn(async () => toArrayBuffer(buffer)),
    };
}

function createChubCharacterMetadata({ name = 'Chub Hero', avatarUrl = 'https://avatars.example/chub.png' } = {}) {
    return {
        node: {
            max_res_url: avatarUrl,
            topics: ['hero'],
            definition: {
                name,
                personality: '',
                tavern_personality: '',
                scenario: '',
                first_message: '',
                example_dialogs: '',
                description: '',
                system_prompt: '',
                post_history_instructions: '',
                alternate_greetings: [],
                embedded_lorebook: null,
                extensions: {},
            },
        },
    };
}

describe('external content import service', () => {
    test('extracts host from URL.hostname and rejects invalid URL strings', () => {
        expect(getHostFromUrl('https://example.test/path?next=https://evil.test')).toBe('example.test');
        expect(getHostFromUrl('not a url')).toBe('');
    });

    test('checks generic import hosts by normalized exact hostname', () => {
        expect(isHostWhitelisted('cdn.example.test', ['cdn.example.test'])).toBe(true);
        expect(isHostWhitelisted('evilcdn.example.test', ['cdn.example.test'])).toBe(false);
    });

    test.each([
        ['chub character', 'https://chub.ai/characters/creator/name', { source: 'chub_character', type: 'character', id: 'creator/name' }],
        ['chub lorebook', 'https://characterhub.org/lorebooks/creator/book', { source: 'chub_lorebook', type: 'lorebook', id: 'lorebooks/creator/book' }],
        ['pygmalion', 'https://pygmalion.chat/character/123e4567-e89b-12d3-a456-426614174000', { source: 'pygmalion_character', type: 'character', id: '123e4567-e89b-12d3-a456-426614174000' }],
        ['janitor', 'https://janitorai.com/characters/123e4567-e89b-12d3-a456-426614174000', { source: 'janitor_character', type: 'character', id: '123e4567-e89b-12d3-a456-426614174000' }],
        ['ai character cards', 'https://aicharactercards.com/author/card-name', { source: 'aicc_character', type: 'character', id: 'author/card-name' }],
        ['risu', 'https://realm.risuai.net/character/7adb0ed8-d818-55c8-20b3-506980fb40f0', { source: 'risu_character', type: 'character', id: '7adb0ed8-d818-55c8-20b3-506980fb40f0' }],
        ['perchance', 'https://perchance.org/ai-character-chat?data=Personality_Advisor~6903e991c90fd1dba52c036d917e99c6.gz', { source: 'perchance_character', type: 'character', id: '6903e991c90fd1dba52c036d917e99c6.gz' }],
        ['generic png', 'https://cdn.example.test/cards/hero', { source: 'generic_png', type: 'character', id: 'https://cdn.example.test/cards/hero' }],
    ])('classifies %s source descriptors', (_name, url, expected) => {
        expect(classifyExternalContentUrl(url, ['cdn.example.test'])).toEqual({
            ok: true,
            descriptor: expect.objectContaining(expected),
        });
    });

    test('classifies invalid and unsupported hosts as typed failures', () => {
        expect(classifyExternalContentUrl('not a url', [])).toEqual({
            ok: false,
            failure: { kind: 'invalid_url', url: 'not a url' },
        });
        expect(classifyExternalContentUrl('https://unlisted.example.test/card.png', [])).toEqual({
            ok: false,
            failure: {
                kind: 'unsupported_host',
                host: 'unlisted.example.test',
                url: 'https://unlisted.example.test/card.png',
            },
        });
    });

    test.each([
        ['pygmalion uuid', '123e4567-e89b-12d3-a456-426614174000', { source: 'pygmalion_character', type: 'character', id: '123e4567-e89b-12d3-a456-426614174000' }],
        ['janitor uuid', '123e4567-e89b-12d3-a456-426614174000_character', { source: 'janitor_character', type: 'character', id: '123e4567-e89b-12d3-a456-426614174000' }],
        ['aicc uuid', 'AICC/author/card', { source: 'aicc_character', type: 'character', id: 'author/card' }],
        ['perchance uuid', 'Personality_Advisor~6903e991c90fd1dba52c036d917e99c6.gz', { source: 'perchance_character', type: 'character', id: '6903e991c90fd1dba52c036d917e99c6.gz' }],
        ['chub lorebook uuid', 'lorebooks/author/book', { source: 'chub_lorebook', type: 'lorebook', id: 'lorebooks/author/book' }],
        ['chub character uuid', 'author/card', { source: 'chub_character', type: 'character', id: 'author/card' }],
    ])('classifies %s import ids', (_name, input, expected) => {
        expect(classifyExternalContentId(input)).toEqual({
            ok: true,
            descriptor: expect.objectContaining(expected),
        });
    });

    test('classifies fetch non-2xx and network failures through one wrapper', async () => {
        const nonOkFetch = jest.fn(async () => createResponse({ ok: false, status: 503, statusText: 'Unavailable' }));
        await expect(fetchExternalResource({
            url: 'https://provider.test/metadata',
            source: 'chub_character',
            stage: 'metadata',
            requireOk: true,
            fetchImpl: nonOkFetch,
        })).resolves.toEqual({
            ok: false,
            response: expect.any(Object),
            failure: {
                kind: 'provider_non_2xx',
                source: 'chub_character',
                stage: 'metadata',
                url: 'https://provider.test/metadata',
                status: 503,
                statusText: 'Unavailable',
            },
        });

        const networkFetch = jest.fn(async () => {
            throw new Error('socket closed');
        });
        await expect(fetchExternalResource({
            url: 'https://provider.test/raw',
            source: 'chub_character',
            stage: 'artifact',
            fetchImpl: networkFetch,
        })).resolves.toEqual({
            ok: false,
            response: null,
            failure: {
                kind: 'network_error',
                source: 'chub_character',
                stage: 'artifact',
                url: 'https://provider.test/raw',
                message: 'socket closed',
            },
        });
    });

    test('wraps provider downloaders into stable artifact envelopes with secondary fetch trace', async () => {
        const fetchImpl = jest.fn(async () => createResponse());
        const descriptor = {
            source: 'chub_lorebook',
            type: 'lorebook',
            id: 'lorebooks/creator/book',
            url: 'https://chub.ai/lorebooks/creator/book',
        };
        const result = await downloadExternalContentArtifact({
            descriptor,
            fetchImpl,
            downloaders: {
                chub_lorebook: async (_descriptor, { fetchExternalResource: fetchResource }) => {
                    await fetchResource({ url: 'https://api.chub.ai/api/lorebooks/creator/book', stage: 'metadata', requireOk: true });
                    await fetchResource({ url: 'https://api.chub.ai/api/v4/projects/1/raw', stage: 'artifact', requireOk: true });
                    return {
                        buffer: Buffer.from('{}'),
                        fileName: 'book.json',
                        fileType: 'application/json',
                    };
                },
            },
        });

        expect(result).toEqual({
            ok: true,
            artifact: {
                provider: 'chub_lorebook',
                source: 'chub_lorebook',
                type: 'lorebook',
                fileName: 'book.json',
                fileType: 'application/json',
                buffer: Buffer.from('{}'),
            },
            trace: [
                { source: 'chub_lorebook', stage: 'metadata', url: 'https://api.chub.ai/api/lorebooks/creator/book', ok: true },
                { source: 'chub_lorebook', stage: 'artifact', url: 'https://api.chub.ai/api/v4/projects/1/raw', ok: true },
            ],
        });
    });

    test('returns typed artifact failures without route-specific status decisions', async () => {
        await expect(downloadExternalContentArtifact({
            descriptor: { source: 'generic_png', type: 'character', id: 'https://cdn.example.test/card.png' },
            downloaders: { generic_png: async () => null },
        })).resolves.toEqual({
            ok: false,
            failure: {
                kind: 'invalid_artifact',
                source: 'generic_png',
            },
            trace: [],
        });
    });

    test('routes real provider secondary downloads through the artifact wrapper trace', async () => {
        const downloaders = await getExternalContentDownloaders();
        const pngBuffer = fs.readFileSync(fileURLToPath(new URL('../public/img/ai4.png', import.meta.url)));
        const perchanceBuffer = zlib.gzipSync(JSON.stringify({
            addCharacter: {
                name: 'Perchance Hero',
                avatar: { url: 'https://avatars.example/perchance.png' },
                roleInstruction: '',
                reminderMessage: '',
            },
        }));
        const cases = [
            {
                name: 'chub lorebook metadata and raw file',
                descriptor: { source: 'chub_lorebook', type: 'lorebook', id: 'lorebooks/creator/book' },
                responses: [
                    createResponse({ jsonBody: { node: { id: 42 } } }),
                    createResponse({ buffer: Buffer.from('{}'), contentType: 'application/json' }),
                ],
                trace: [
                    { source: 'chub_lorebook', stage: 'metadata', url: 'https://api.chub.ai/api/lorebooks/creator/book', ok: true },
                    { source: 'chub_lorebook', stage: 'artifact', url: 'https://api.chub.ai/api/v4/projects/42/repository/files/raw%252Fsillytavern_raw.json/raw', ok: true },
                ],
            },
            {
                name: 'chub character metadata and avatar',
                descriptor: { source: 'chub_character', type: 'character', id: 'creator/card' },
                responses: [
                    createResponse({ jsonBody: createChubCharacterMetadata() }),
                    createResponse({ buffer: pngBuffer, url: 'https://avatars.example/chub.png' }),
                ],
                trace: [
                    { source: 'chub_character', stage: 'metadata', url: 'https://api.chub.ai/api/characters/creator/card?full=true', ok: true },
                    { source: 'chub_character', stage: 'avatar', url: 'https://avatars.example/chub.png', ok: true },
                ],
            },
            {
                name: 'pygmalion metadata and avatar',
                descriptor: { source: 'pygmalion_character', type: 'character', id: '123e4567-e89b-12d3-a456-426614174000' },
                responses: [
                    createResponse({
                        jsonBody: {
                            character: {
                                spec: 'chara_card_v2',
                                spec_version: '2.0',
                                data: { name: 'Pyg Hero', avatar: 'https://avatars.example/pyg.png' },
                            },
                        },
                    }),
                    createResponse({ buffer: pngBuffer, url: 'https://avatars.example/pyg.png' }),
                ],
                trace: [
                    { source: 'pygmalion_character', stage: 'metadata', url: 'https://server.pygmalion.chat/api/export/character/123e4567-e89b-12d3-a456-426614174000/v2', ok: true },
                    { source: 'pygmalion_character', stage: 'avatar', url: 'https://avatars.example/pyg.png', ok: true },
                ],
            },
            {
                name: 'janitor metadata and artifact',
                descriptor: { source: 'janitor_character', type: 'character', id: '123e4567-e89b-12d3-a456-426614174000' },
                responses: [
                    createResponse({ jsonBody: { status: 'ok', downloadUrl: 'https://janitor.example/card.png' } }),
                    createResponse({ buffer: pngBuffer, url: 'https://janitor.example/card.png' }),
                ],
                trace: [
                    { source: 'janitor_character', stage: 'metadata', url: 'https://api.jannyai.com/api/v1/download', ok: true },
                    { source: 'janitor_character', stage: 'artifact', url: 'https://janitor.example/card.png', ok: true },
                ],
            },
            {
                name: 'perchance metadata and avatar',
                descriptor: { source: 'perchance_character', type: 'character', id: '6903e991c90fd1dba52c036d917e99c6.gz' },
                responses: [
                    createResponse({ buffer: perchanceBuffer, contentType: 'application/gzip' }),
                    createResponse({ buffer: pngBuffer, url: 'https://avatars.example/perchance.png' }),
                ],
                trace: [
                    { source: 'perchance_character', stage: 'metadata', url: 'https://user.uploads.dev/file/6903e991c90fd1dba52c036d917e99c6.gz', ok: true },
                    { source: 'perchance_character', stage: 'avatar', url: 'https://avatars.example/perchance.png', ok: true },
                ],
            },
        ];

        for (const item of cases) {
            const responses = [...item.responses];
            const fetchImpl = jest.fn(async () => responses.shift());
            const result = await downloadExternalContentArtifact({
                descriptor: item.descriptor,
                downloaders,
                fetchImpl,
            });

            expect(result.ok).toBe(true);
            expect(result.trace).toEqual(item.trace);
            expect(fetchImpl).toHaveBeenCalledTimes(item.trace.length);
        }
    });

    test('validates asset download URL and host before returning a stream response envelope', async () => {
        expect(validateExternalAssetUrl({
            url: 'https://cdn.example.test/file.mp3',
            allowlist: ['cdn.example.test'],
        })).toEqual({
            ok: true,
            host: 'cdn.example.test',
        });

        expect(await downloadExternalAsset({
            url: 'not a url',
            allowlist: ['cdn.example.test'],
        })).toEqual({
            ok: false,
            failure: { kind: 'invalid_url', url: 'not a url' },
        });

        expect(await downloadExternalAsset({
            url: 'https://unlisted.example.test/file.mp3',
            allowlist: ['cdn.example.test'],
        })).toEqual({
            ok: false,
            failure: {
                kind: 'unsupported_host',
                host: 'unlisted.example.test',
                url: 'https://unlisted.example.test/file.mp3',
            },
        });

        const body = { pipe: jest.fn() };
        const response = createResponse({ body });
        const fetchImpl = jest.fn(async () => response);
        await expect(downloadExternalAsset({
            url: 'https://cdn.example.test/file.mp3',
            allowlist: ['cdn.example.test'],
            fetchImpl,
        })).resolves.toEqual({
            ok: true,
            host: 'cdn.example.test',
            response,
        });
    });
});
