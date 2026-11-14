import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import yaml from 'yaml';

import { addMissingConfigValues } from '../src/config-init.ts';

const envKeys = [
    'EMBERDESK_DISABLETHUMBNAILS', 'EMBERDESK_THUMBNAILS_ENABLED',
    'EMBERDESK_AUTORUN', 'EMBERDESK_BROWSERLAUNCH_ENABLED',
    'EMBERDESK_ENABLEEXTENSIONS', 'EMBERDESK_EXTENSIONS_ENABLED',
];

describe('config initialization characterization', () => {
    let root;
    let target;
    let env;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-config-init-'));
        target = path.join(root, 'config.yaml');
        env = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
        for (const key of envKeys) delete process.env[key];
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        for (const key of envKeys) {
            if (env[key] === undefined) delete process.env[key];
            else process.env[key] = env[key];
        }
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const load = () => yaml.parse(fs.readFileSync(target, 'utf8'));

    test('creates missing config and fills defaults for existing config', () => {
        addMissingConfigValues(target);
        expect(load().port).toBe(8000);
        expect(console.warn).toHaveBeenCalled();
        fs.writeFileSync(target, 'port: 4321\n');
        addMissingConfigValues(target);
        expect(load().port).toBe(4321);
        expect(load().thumbnails.quality).toBe(85);
    });

    test('migrates YAML keys, overwrites destination, and removes retired keys', () => {
        fs.writeFileSync(target, 'disableThumbnails: true\ncardsCacheCapacity: 25\nenableExtensions: true\nthumbnails:\n  enabled: true\n');
        addMissingConfigValues(target);
        const config = load();
        expect(config.thumbnails.enabled).toBe(false);
        expect(config.performance.memoryCacheCapacity).toBe('25mb');
        expect(config).not.toHaveProperty('disableThumbnails');
        expect(config).not.toHaveProperty('enableExtensions');
    });

    test('migrates environment values with existing truthiness and string coercion', () => {
        fs.writeFileSync(target, 'port: 8000\n');
        process.env.EMBERDESK_DISABLETHUMBNAILS = 'false';
        process.env.EMBERDESK_ENABLEEXTENSIONS = 'true';
        process.env.EMBERDESK_AUTORUN = 'true';
        process.env.EMBERDESK_BROWSERLAUNCH_ENABLED = 'false';
        addMissingConfigValues(target);
        expect(process.env.EMBERDESK_THUMBNAILS_ENABLED).toBe('false');
        expect(process.env.EMBERDESK_EXTENSIONS_ENABLED).toBe('undefined');
        expect(process.env.EMBERDESK_DISABLETHUMBNAILS).toBeUndefined();
        expect(process.env.EMBERDESK_ENABLEEXTENSIONS).toBeUndefined();
        expect(process.env.EMBERDESK_AUTORUN).toBe('true');
        expect(process.env.EMBERDESK_BROWSERLAUNCH_ENABLED).toBe('false');
    });

    test('preserves null and combines array entries according to defaultsDeep', () => {
        fs.writeFileSync(target, 'port: null\nwhitelist:\n  - example\n');
        addMissingConfigValues(target);
        const config = load();
        expect(config.port).toBeNull();
        expect(config.whitelist).toEqual(['example', '127.0.0.1']);
    });

    test('does not rewrite an already complete config', () => {
        const defaults = fs.readFileSync(new URL('../default/config.yaml', import.meta.url), 'utf8');
        fs.writeFileSync(target, defaults);
        const write = jest.spyOn(fs, 'writeFileSync');
        addMissingConfigValues(target);
        expect(write).not.toHaveBeenCalled();
        expect(fs.readFileSync(target, 'utf8')).toBe(defaults);
    });

    test('warns and leaves malformed YAML untouched', () => {
        const input = 'invalid: [\n';
        fs.writeFileSync(target, input);
        expect(() => addMissingConfigValues(target)).not.toThrow();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Could not add missing config values'), expect.anything());
        expect(fs.readFileSync(target, 'utf8')).toBe(input);
    });
});
