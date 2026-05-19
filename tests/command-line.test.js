import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
    parseArgv,
    prepareConfigFilesystem,
    prepareDataRoot,
    resolveConfig,
    CommandLineParser,
} from '../src/command-line.js';

// ─── helpers ───────────────────────────────────────────────────────────────────

/** Default config values matching getDefaultConfig(false) */
const BASE_DEFAULTS = Object.freeze({
    configPath: './config.yaml',
    dataRoot: './data',
    port: 8000,
    listen: false,
    listenAddressIPv6: '[::]',
    listenAddressIPv4: '0.0.0.0',
    enableIPv4: true,
    enableIPv6: false,
    dnsPreferIPv6: false,
    heartbeatInterval: 0,
    browserLaunchEnabled: false,
    browserLaunchHostname: 'auto',
    browserLaunchPort: -1,
    browserLaunchAvoidLocalhost: false,
    enableCorsProxy: false,
    disableCsrf: false,
    ssl: false,
    certPath: 'certs/cert.pem',
    keyPath: 'certs/privkey.pem',
    keyPassphrase: '',
    whitelistMode: true,
    basicAuthMode: false,
    enableKeepAlive: false,
    requestProxyEnabled: false,
    requestProxyUrl: '',
    requestProxyBypass: [],
});

function makeDefaults(overrides = {}) {
    return Object.freeze({ ...BASE_DEFAULTS, ...overrides });
}

/**
 * argv with all fields populated to non-null defaults.
 * Override only the field(s) under test.
 * This prevents resolveConfig from calling getConfigValue (which needs a real config file).
 */
function makeArgv(overrides = {}) {
    return {
        isGlobal: false,
        configPath: './config.yaml',
        dataRoot: './data',
        port: 8000,
        listen: false,
        listenAddressIPv6: '[::]',
        listenAddressIPv4: '0.0.0.0',
        enableIPv4: true,
        enableIPv6: false,
        dnsPreferIPv6: false,
        heartbeatInterval: 0,
        browserLaunchEnabled: false,
        browserLaunchHostname: 'auto',
        browserLaunchPort: -1,
        browserLaunchAvoidLocalhost: false,
        enableCorsProxy: false,
        disableCsrf: false,
        ssl: false,
        certPath: 'certs/cert.pem',
        keyPath: 'certs/privkey.pem',
        keyPassphrase: '',
        whitelistMode: true,
        basicAuthMode: false,
        enableKeepAlive: false,
        requestProxyEnabled: false,
        requestProxyUrl: '',
        requestProxyBypass: [],
        ...overrides,
    };
}

// ─── Phase 1: parseArgv ────────────────────────────────────────────────────────

describe('parseArgv', () => {
    let warnSpy;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
        delete globalThis.FORCE_GLOBAL_MODE;
    });

    test('default args: isGlobal=false, all value fields null', () => {
        const result = parseArgv(['node', 'server.js']);
        expect(result.isGlobal).toBe(false);
        expect(result.port).toBeNull();
        expect(result.listen).toBeNull();
        expect(result.dataRoot).toBeNull();
        expect(result.enableIPv4).toBeNull();
        expect(result.ssl).toBeNull();
    });

    test('--global: isGlobal=true, configPath uses envPaths', () => {
        const result = parseArgv(['node', 'server.js', '--global']);
        expect(result.isGlobal).toBe(true);
        expect(result.configPath).toContain('EmberDesk');
        expect(result.configPath).toMatch(/config\.yaml$/);
    });

    test('--port 3000 --listen: correct values', () => {
        const result = parseArgv(['node', 'server.js', '--port', '3000', '--listen']);
        expect(result.port).toBe(3000);
        expect(result.listen).toBe(true);
    });

    test('--enableIPv4 auto: raw string, not coerced', () => {
        const result = parseArgv(['node', 'server.js', '--enableIPv4', 'auto']);
        expect(result.enableIPv4).toBe('auto');
    });

    test('--autorun true: deprecated alias mapped to browserLaunchEnabled', () => {
        const result = parseArgv(['node', 'server.js', '--autorun', 'true']);
        expect(result.browserLaunchEnabled).toBe(true);
    });

    test('--autorunHostname foo: deprecated alias mapped', () => {
        const result = parseArgv(['node', 'server.js', '--autorunHostname', 'foo']);
        expect(result.browserLaunchHostname).toBe('foo');
    });

    test('global mode + --configPath: warns and ignores configPath', () => {
        const result = parseArgv(['node', 'server.js', '--global', '--configPath', '/tmp/x']);
        expect(warnSpy).toHaveBeenCalled();
        expect(result.configPath).not.toBe('/tmp/x');
        expect(result.configPath).toContain('EmberDesk');
    });

    test('global mode + --dataRoot: warns', () => {
        parseArgv(['node', 'server.js', '--global', '--dataRoot', '/tmp/d']);
        expect(warnSpy).toHaveBeenCalled();
    });

    test('globalThis.FORCE_GLOBAL_MODE=true: isGlobal=true', () => {
        globalThis.FORCE_GLOBAL_MODE = true;
        const result = parseArgv(['node', 'server.js']);
        expect(result.isGlobal).toBe(true);
    });
});

// ─── Phase 2: prepareFilesystem ────────────────────────────────────────────────

describe('prepareConfigFilesystem', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('global mode with missing parent dir: creates dir and writes config', () => {
        const configPath = path.join(tmpDir, 'nested', 'deep', 'config.yaml');
        prepareConfigFilesystem(configPath, true);
        expect(fs.existsSync(path.dirname(configPath))).toBe(true);
        expect(fs.existsSync(configPath)).toBe(true);
    });

    test('idempotent: calling twice does not error', () => {
        const configPath = path.join(tmpDir, 'config.yaml');
        expect(() => {
            prepareConfigFilesystem(configPath, false);
            prepareConfigFilesystem(configPath, false);
        }).not.toThrow();
    });
});

describe('prepareDataRoot', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('missing dataRoot: creates directory', () => {
        const dataRoot = path.join(tmpDir, 'data');
        expect(fs.existsSync(dataRoot)).toBe(false);
        prepareDataRoot(dataRoot);
        expect(fs.existsSync(dataRoot)).toBe(true);
    });

    test('null dataRoot: no-op', () => {
        expect(() => prepareDataRoot(null)).not.toThrow();
    });
});

// ─── Phase 3: resolveConfig ────────────────────────────────────────────────────

describe('resolveConfig', () => {
    test('no CLI overrides: values from defaults when argv matches defaults', () => {
        const argv = makeArgv();
        const result = resolveConfig(argv, makeDefaults());
        expect(result.port).toBe(8000);
        expect(result.listen).toBe(false);
        expect(result.ssl).toBe(false);
        expect(result.enableIPv4).toBe(true);
        expect(result.enableIPv6).toBe(false);
    });

    test('CLI --port 9000 overrides default 8000', () => {
        const argv = makeArgv({ port: 9000 });
        const result = resolveConfig(argv, makeDefaults());
        expect(result.port).toBe(9000);
    });

    test('CLI --ssl true overrides default false', () => {
        const argv = makeArgv({ ssl: true });
        const result = resolveConfig(argv, makeDefaults());
        expect(result.ssl).toBe(true);
    });

    test('invalid enableIPv6 value: falls back to default, warns', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        // stringToBool('yes') returns 'yes' (non-null), so ?? skips getConfigValue
        const argv = makeArgv({ enableIPv6: 'yes' });
        const result = resolveConfig(argv, makeDefaults());
        expect(result.enableIPv6).toBe(false);
        warnSpy.mockRestore();
        logSpy.mockRestore();
    });

    test('invalid enableIPv4 value: falls back to default', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const argv = makeArgv({ enableIPv4: 'nope' });
        const result = resolveConfig(argv, makeDefaults());
        expect(result.enableIPv4).toBe(true);
        warnSpy.mockRestore();
        logSpy.mockRestore();
    });

    test('valid enableIPv6 auto: passes through', () => {
        const argv = makeArgv({ enableIPv6: 'auto' });
        const result = resolveConfig(argv, makeDefaults());
        expect(result.enableIPv6).toBe('auto');
    });

    test('getIPv4ListenUrl: ssl=true, listen=false -> https://127.0.0.1:8000', () => {
        const argv = makeArgv({ ssl: true, listen: false });
        const result = resolveConfig(argv, makeDefaults({ ssl: true }));
        expect(result.getIPv4ListenUrl().toString()).toBe('https://127.0.0.1:8000/');
    });

    test('getIPv6ListenUrl: ssl=false, listen=true -> http://[::]:8000', () => {
        const argv = makeArgv({ listen: true });
        const result = resolveConfig(argv, makeDefaults({ listen: true }));
        expect(result.getIPv6ListenUrl().toString()).toBe('http://[::]:8000/');
    });

    test('getBrowserLaunchHostname: auto, dual stack -> localhost', async () => {
        const argv = makeArgv();
        const result = resolveConfig(argv, makeDefaults());
        const hostname = await result.getBrowserLaunchHostname({ useIPv6: true, useIPv4: true });
        expect(hostname).toBe('localhost');
    });

    test('getBrowserLaunchHostname: auto, IPv6 only -> [::1]', async () => {
        const argv = makeArgv();
        const result = resolveConfig(argv, makeDefaults());
        const hostname = await result.getBrowserLaunchHostname({ useIPv6: true, useIPv4: false });
        expect(hostname).toBe('[::1]');
    });

    test('getBrowserLaunchUrl: port override 3000', () => {
        const argv = makeArgv({ browserLaunchPort: 3000 });
        const result = resolveConfig(argv, makeDefaults());
        expect(result.getBrowserLaunchUrl('localhost').toString()).toBe('http://localhost:3000/');
    });

    test('getBrowserLaunchUrl: -1 uses server port', () => {
        const argv = makeArgv({ port: 9000, browserLaunchPort: -1 });
        const result = resolveConfig(argv, makeDefaults());
        expect(result.getBrowserLaunchUrl('localhost').toString()).toBe('http://localhost:9000/');
    });
});

// ─── Orchestrator: CommandLineParser.parse() ───────────────────────────────────

describe('CommandLineParser.parse()', () => {
    let tmpDir;
    let origDir;
    let origDataRoot;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-test-'));
        origDir = process.cwd();
        process.chdir(tmpDir);
        origDataRoot = process.env.EMBERDESK_DATAROOT;
        // Set env var so getConfigValue resolves dataRoot without reading stale CACHED_CONFIG
        process.env.EMBERDESK_DATAROOT = path.join(tmpDir, 'data');
    });

    afterEach(() => {
        process.chdir(origDir);
        if (origDataRoot === undefined) {
            delete process.env.EMBERDESK_DATAROOT;
        } else {
            process.env.EMBERDESK_DATAROOT = origDataRoot;
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('default args: returns object with all expected keys and functions', () => {
        const parser = new CommandLineParser();
        const result = parser.parse(['node', 'server.js']);
        expect(result).toHaveProperty('configPath');
        expect(result).toHaveProperty('dataRoot');
        expect(result).toHaveProperty('port', 8000);
        expect(result).toHaveProperty('listen', false);
        expect(result).toHaveProperty('ssl', false);
        expect(typeof result.getIPv4ListenUrl).toBe('function');
        expect(typeof result.getIPv6ListenUrl).toBe('function');
        expect(typeof result.getBrowserLaunchHostname).toBe('function');
        expect(typeof result.getBrowserLaunchUrl).toBe('function');
    });

    test('--port 9000: result has port=9000', () => {
        const parser = new CommandLineParser();
        const result = parser.parse(['node', 'server.js', '--port', '9000']);
        expect(result.port).toBe(9000);
    });

    test('global mode: configPath uses envPaths', () => {
        const parser = new CommandLineParser();
        const result = parser.parse(['node', 'server.js', '--global']);
        expect(result.configPath).toContain('EmberDesk');
        expect(result.configPath).toMatch(/config\.yaml$/);
    });

    test('missing config file: config file created with defaults', () => {
        const parser = new CommandLineParser();
        parser.parse(['node', 'server.js']);
        expect(fs.existsSync('./config.yaml')).toBe(true);
    });

    test('dataRoot from env var: uses env var value', () => {
        const parser = new CommandLineParser();
        const result = parser.parse(['node', 'server.js']);
        expect(result.dataRoot).toContain(tmpDir);
    });

    test('all expected keys have correct types', () => {
        const parser = new CommandLineParser();
        const result = parser.parse(['node', 'server.js']);
        expect(typeof result.configPath).toBe('string');
        expect(typeof result.dataRoot).toBe('string');
        expect(typeof result.port).toBe('number');
        expect(typeof result.listen).toBe('boolean');
        expect(typeof result.ssl).toBe('boolean');
    });
});
