import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setConfigFilePath } from '../src/util.js';

const tmpConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-settings-get-config-'));
const tmpConfigPath = path.join(tmpConfigRoot, 'config.yaml');
fs.writeFileSync(tmpConfigPath, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfigPath);

const { router } = await import('../src/endpoints/settings.js');

const roots = [];

function createResponse() {
    return {
        body: undefined,
        statusCode: 200,
        send(payload) { this.body = payload; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; return this; },
        status(code) { this.statusCode = code; return this; },
    };
}

async function invokeSettingsGet(directories) {
    const layer = router.stack.find(entry => entry.route?.path === '/get' && entry.route.methods?.post);
    if (!layer) {
        throw new Error('Route not found: POST /get');
    }

    const response = createResponse();
    await layer.route.stack[0].handle({ user: { directories } }, response);
    return response;
}

function makeDirectories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-settings-get-'));
    roots.push(root);

    const directories = {
        root,
        novelAI_Settings: path.join(root, 'NovelAI Settings'),
        openAI_Settings: path.join(root, 'OpenAI Settings'),
        koboldAI_Settings: path.join(root, 'KoboldAI Settings'),
        textGen_Settings: path.join(root, 'TextGen Settings'),
        worlds: path.join(root, 'worlds'),
        themes: path.join(root, 'themes'),
        movingUI: path.join(root, 'movingUI'),
        quickreplies: path.join(root, 'QuickReplies'),
        instruct: path.join(root, 'instruct'),
        context: path.join(root, 'context'),
        sysprompt: path.join(root, 'sysprompt'),
        reasoning: path.join(root, 'reasoning'),
    };

    for (const dir of Object.values(directories)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'settings.json'), '{}', 'utf8');
    return directories;
}

describe('settings get route', () => {
    beforeAll(() => {
        roots.push(tmpConfigRoot);
    });

    afterEach(() => {
        while (roots.length) {
            fs.rmSync(roots.pop(), { recursive: true, force: true });
        }
    });

    test('keeps legacy TextGen preset fields in the settings payload', async () => {
        const directories = makeDirectories();
        fs.writeFileSync(path.join(directories.textGen_Settings, 'textgen.json'), JSON.stringify({ name: 'TextGen' }), 'utf8');

        const response = await invokeSettingsGet(directories);

        expect(response.statusCode).toBe(200);
        expect(response.body.textgenerationwebui_presets).toEqual([JSON.stringify({ name: 'TextGen' })]);
        expect(response.body.textgenerationwebui_preset_names).toEqual(['textgen']);
    });
});
