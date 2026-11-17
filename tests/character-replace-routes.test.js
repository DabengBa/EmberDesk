import express from 'express';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { createCharacterTextReplaceHandlers } from '../src/endpoints/character-replace-routes.ts';

let server;
let origin;
const writes = [];

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = { profile: { handle: 'alice' }, directories: {} };
        next();
    });
    const handlers = createCharacterTextReplaceHandlers({
        getCanonicalCharacterCardJson: async (_handle, _directories, avatar) => {
            if (avatar === 'broken.png') throw new Error('read failed');
            return JSON.stringify({ description: 'old', data: { description: 'old' } });
        },
        getCharacterWriteDependencies: () => ({}),
        editCharacterCard: async options => {
            writes.push(options);
            return { ok: true };
        },
    });
    app.post('/preview', handlers.preview);
    app.post('/apply', handlers.apply);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function post(route, body) {
    return fetch(`${origin}/${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
}

describe('character replacement HTTP handlers', () => {
    const body = { avatar_url: 'alice.png', query: 'old', replacement: 'new', areas: { card: true } };

    test('preview reports changes without writing; apply commits them', async () => {
        const preview = await post('preview', body);
        expect(preview.status).toBe(200);
        expect(await preview.json()).toMatchObject({ ok: true, applied: { card: false }, areas: { card: { status: 'preview' } } });
        expect(writes).toHaveLength(0);
        const apply = await post('apply', body);
        expect(apply.status).toBe(200);
        expect(await apply.json()).toMatchObject({ ok: true, applied: { card: true }, areas: { card: { status: 'applied' } } });
        expect(writes).toHaveLength(1);
        expect(JSON.parse(writes[0].characterData).data.description).toBe('new');
    });

    test.each(['preview', 'apply'])('%s preserves validation and unexpected error responses', async route => {
        const invalid = await post(route, { ...body, query: '' });
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toMatchObject({ ok: false });
        const failure = await post(route, { ...body, avatar_url: 'broken.png' });
        expect(failure.status).toBe(500);
        expect(await failure.json()).toEqual({ error: `Text replace ${route} failed.` });
    });
});
