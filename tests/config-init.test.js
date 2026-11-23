import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { parse } from 'jsonc-parser';
import yaml from 'yaml';

import { prepareConfig } from '../src/config-init.ts';

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

    const load = () => parse(fs.readFileSync(path.join(root, 'config.jsonc'), 'utf8'), [], { allowTrailingComma: true });

    test('migrates legacy YAML once without changing it and retains JSONC comments', () => {
        const legacy = 'port: 4321\nwhitelistImportDomains: ["*.r2.cloudflarestorage.com"]\n';
        fs.writeFileSync(target, legacy);
        const canonical = path.join(root, 'config.jsonc');
        prepareConfig(canonical);
        expect(parse(fs.readFileSync(canonical, 'utf8'))).toMatchObject({ port: 4321, whitelistImportDomains: expect.arrayContaining(['*.r2.cloudflarestorage.com']) });
        expect(fs.readFileSync(target, 'utf8')).toBe(legacy);
        const edited = '// custom port\n{ "port": 8765 }\n';
        fs.writeFileSync(canonical, edited);
        prepareConfig(canonical);
        expect(fs.readFileSync(canonical, 'utf8')).toContain('// custom port');
        expect(parse(fs.readFileSync(canonical, 'utf8')).port).toBe(8765);
    });

    test('reports invalid JSONC field names instead of falling back to YAML', () => {
        const canonical = path.join(root, 'config.jsonc');
        fs.writeFileSync(target, 'port: 4321\n');
        fs.writeFileSync(canonical, '{ "whitelistImportDomains": "example.com" }');
        expect(() => prepareConfig(canonical)).toThrow(/whitelistImportDomains/);
    });

    test('keeps explicit arrays in a complete YAML migration and subsequent JSONC edits', () => {
        const defaults = parse(fs.readFileSync(new URL('../default/config.jsonc', import.meta.url), 'utf8'), [], { allowTrailingComma: true });
        const domains = ['cdn.example.test'];
        fs.writeFileSync(target, yaml.stringify({ ...defaults, whitelistImportDomains: domains }));
        const { configPath, config } = prepareConfig(target);
        expect(config.whitelistImportDomains).toEqual(domains);
        expect(prepareConfig(configPath).config.whitelistImportDomains).toEqual(domains);
        fs.writeFileSync(configPath, '{"whitelistImportDomains": []}');
        expect(prepareConfig(configPath).config.whitelistImportDomains).toEqual([]);
    });

    test('converts legacy numeric strings and preserves supported comma-separated CORS settings', () => {
        fs.writeFileSync(target, 'port: "8123"\ncors:\n  methods: GET,POST\n  allowedHeaders: Accept,Content-Type\n');
        expect(prepareConfig(target).config).toMatchObject({
            port: 8123,
            cors: { methods: 'GET,POST', allowedHeaders: 'Accept,Content-Type' },
        });
        expect(load().port).toBe(8123);
    });

    test('creates missing config and fills defaults for existing config', () => {
        prepareConfig(target);
        expect(load().port).toBe(8000);
        expect(console.warn).toHaveBeenCalled();
        fs.writeFileSync(path.join(root, 'config.jsonc'), '{ "port": 4321 }');
        const { config } = prepareConfig(target);
        expect(config.port).toBe(4321);
        expect(config.thumbnails.quality).toBe(85);
    });

    test('migrates YAML keys, overwrites destination, and removes retired keys', () => {
        fs.writeFileSync(target, 'disableThumbnails: true\ncardsCacheCapacity: 25\nenableExtensions: true\nthumbnails:\n  enabled: true\n');
        prepareConfig(target);
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
        prepareConfig(target);
        expect(process.env.EMBERDESK_THUMBNAILS_ENABLED).toBe('false');
        expect(process.env.EMBERDESK_EXTENSIONS_ENABLED).toBe('undefined');
        expect(process.env.EMBERDESK_DISABLETHUMBNAILS).toBeUndefined();
        expect(process.env.EMBERDESK_ENABLEEXTENSIONS).toBeUndefined();
        expect(process.env.EMBERDESK_AUTORUN).toBe('true');
        expect(process.env.EMBERDESK_BROWSERLAUNCH_ENABLED).toBe('false');
    });

    test('preserves null and combines array entries according to defaultsDeep', () => {
        fs.writeFileSync(target, 'port: null\nwhitelist:\n  - example\n');
        prepareConfig(target);
        const config = load();
        expect(config.port).toBeNull();
        expect(config.whitelist).toEqual(['example', '127.0.0.1']);
    });

    test('does not rewrite an already complete config', () => {
        const defaults = fs.readFileSync(new URL('../default/config.jsonc', import.meta.url), 'utf8');
        target = path.join(root, 'config.jsonc');
        fs.writeFileSync(target, defaults);
        const write = jest.spyOn(fs, 'writeFileSync');
        prepareConfig(target);
        expect(write).not.toHaveBeenCalled();
        expect(fs.readFileSync(target, 'utf8')).toBe(defaults);
    });

    test('rejects and leaves malformed YAML untouched', () => {
        const input = 'invalid: [\n';
        fs.writeFileSync(target, input);
        expect(() => prepareConfig(target)).toThrow();
        expect(fs.existsSync(path.join(root, 'config.jsonc'))).toBe(false);
        expect(fs.readFileSync(target, 'utf8')).toBe(input);
    });
});
