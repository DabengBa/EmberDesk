import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { createCharacterImportHandler } from '../src/endpoints/character-import-routes.ts';

const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'character-import-route-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'upload'), 'upload');
    const request = { body: { file_type: 'json', preserved_name: 'name.png' }, file: { destination: dir, filename: 'upload' } };
    const response = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis(), sendStatus: jest.fn().mockReturnThis() };
    return { dir, request, response };
}

describe('character import route', () => {
    test('passes preserved basename through and returns imported name', async () => {
        const { request, response } = fixture();
        const importer = jest.fn().mockResolvedValue({ ok: true, fileName: 'saved' });
        await createCharacterImportHandler(importer)(request, response, () => {});
        expect(importer).toHaveBeenCalledWith(expect.objectContaining({ preservedFileName: 'name', format: 'json' }));
        expect(response.send).toHaveBeenCalledWith({ file_name: 'saved' });
    });

    test.each(['failure result', 'exception'])('removes upload after %s', async failure => {
        const { dir, request, response } = fixture();
        const importer = failure === 'exception' ? jest.fn().mockRejectedValue(new Error('import failed')) : jest.fn().mockResolvedValue({ ok: false });
        await createCharacterImportHandler(importer)(request, response, () => {});
        expect(fs.existsSync(path.join(dir, 'upload'))).toBe(false);
        if (failure === 'exception') {
            expect(response.status).toHaveBeenCalledWith(400);
            expect(response.send).toHaveBeenCalledWith({ error: true });
        } else {
            expect(response.sendStatus).toHaveBeenCalledWith(400);
        }
    });
});
