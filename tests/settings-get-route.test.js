import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setConfigFilePath } from '../src/util.js';

const tmpConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-settings-get-config-'));
const tmpConfigPath = path.join(tmpConfigRoot, 'config.yaml');
fs.writeFileSync(tmpConfigPath, 'port: 8000\n', 'utf8');
setConfigFilePath(tmpConfigPath);

// canReadCanonicalFeatureFlags() requires runtime args; without them the
// router would return 503 instead of serving the canonical document.
const hadCommandLineArgs = Object.prototype.hasOwnProperty.call(globalThis, 'COMMAND_LINE_ARGS');
const previousCommandLineArgs = globalThis.COMMAND_LINE_ARGS;
globalThis.COMMAND_LINE_ARGS = {};

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
        storage: path.join(root, 'storage'),
        backups: path.join(root, 'backups'),
        openAI_Settings: path.join(root, 'OpenAI Settings'),
        worlds: path.join(root, 'worlds'),
    };

    for (const dir of Object.values(directories)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return directories;
}

describe('settings get route', () => {
    beforeAll(() => {
        process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED = 'true';
    });

    afterAll(() => {
        delete process.env.EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_ENABLED;
        if (hadCommandLineArgs) {
            globalThis.COMMAND_LINE_ARGS = previousCommandLineArgs;
        } else {
            delete globalThis.COMMAND_LINE_ARGS;
        }
        fs.rmSync(tmpConfigRoot, { recursive: true, force: true });
    });

    afterEach(() => {
        while (roots.length) {
            fs.rmSync(roots.pop(), { recursive: true, force: true });
        }
    });

    test('returns OpenAI preset fields and omits retired provider preset payloads', async () => {
        const directories = makeDirectories();
        fs.writeFileSync(path.join(directories.openAI_Settings, 'openai.json'), JSON.stringify({ name: 'OpenAI' }), 'utf8');

        const response = await invokeSettingsGet(directories);

        expect(response.statusCode).toBe(200);
        // Bootstrapped from the bundled defaults template on first read.
        const defaultsPayload = JSON.parse(
            fs.readFileSync(new URL('../default/templates/settings.json', import.meta.url), 'utf8'),
        );
        expect(JSON.parse(response.body.settings)).toEqual(defaultsPayload);
        expect(response.body.settings_revision).toBe(1);
        expect(fs.existsSync(path.join(directories.root, 'settings.json'))).toBe(false);
        expect(response.body.openai_settings).toEqual([JSON.stringify({ name: 'OpenAI' })]);
        expect(response.body.openai_setting_names).toEqual(['openai']);
        expect(response.body).not.toHaveProperty('textgenerationwebui_presets');
        expect(response.body).not.toHaveProperty('koboldai_settings');
        expect(response.body).not.toHaveProperty('novelai_settings');
        expect(response.body).not.toHaveProperty('quickReplyPresets');
    });
});
