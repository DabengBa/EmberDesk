import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const users = new Map();

const storageMock = {
    getItem: jest.fn(async key => users.get(key)),
    setItem: jest.fn(async (key, value) => {
        users.set(key, value);
    }),
};

const ensurePublicDirectoriesExistMock = jest.fn(async () => {});
const checkForNewContentMock = jest.fn(async () => {});

jest.unstable_mockModule('node-persist', () => ({
    default: storageMock,
}));

jest.unstable_mockModule('../src/util.js', () => ({
    Cache: class {
        #values = new Map();
        set(key, value) { this.#values.set(key, value); }
        get(key) { return this.#values.get(key); }
        remove(key) { this.#values.delete(key); }
    },
    color: {
        blue: value => value,
        magenta: value => value,
    },
    getConfigValue: jest.fn((key, defaultValue) => {
        if (key === 'rateLimiting.accountsSetupMaxAttempts') {
            return 1;
        }
        return defaultValue;
    }),
}));

jest.unstable_mockModule('../src/endpoints/content-manager.js', () => ({
    CONTENT_TYPES: { SETTINGS: 'settings' },
    checkForNewContent: checkForNewContentMock,
}));

jest.unstable_mockModule('../src/users.js', () => ({
    KEY_PREFIX: 'user:',
    ensurePublicDirectoriesExist: ensurePublicDirectoriesExistMock,
    getAccountVersion: () => 'account-version',
    getAllUserHandles: async () => Array.from(users.keys()).map(key => key.replace('user:', '')),
    getPasswordHash: password => `hash:${password}`,
    getPasswordSalt: () => 'salt',
    getUserAvatar: async () => '',
    getUserDirectories: handle => ({ settings: `settings/${handle}` }),
    needsSetup: async () => users.size === 0,
    toKey: handle => `user:${handle}`,
}));

const { router } = await import('../src/endpoints/users-public.js');

function createRequest(body, ip = '127.0.0.1') {
    return {
        body,
        headers: {},
        session: {},
        socket: { remoteAddress: ip },
    };
}

function createResponse() {
    return {
        body: undefined,
        headers: new Map(),
        headersSent: false,
        statusCode: 200,
        json(payload) { this.body = payload; return this; },
        send(payload) { this.body = payload; return this; },
        sendStatus(code) { this.statusCode = code; this.body = code; return this; },
        set(key, value) { this.headers.set(key, value); return this; },
        status(code) { this.statusCode = code; return this; },
    };
}

async function invokeRoute(routePath, request, method = 'post') {
    const layer = router.stack.find(entry => entry.route?.path === routePath && entry.route.methods?.[method]);
    if (!layer) {
        throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
    }

    const response = createResponse();
    await layer.route.stack[0].handle(request, response);
    return response;
}

async function waitFor(condition) {
    for (let i = 0; i < 20; i++) {
        if (condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error('Timed out waiting for test condition');
}

describe('users public setup route', () => {
    beforeEach(() => {
        users.clear();
        storageMock.getItem.mockClear();
        storageMock.setItem.mockClear();
        ensurePublicDirectoriesExistMock.mockClear();
        checkForNewContentMock.mockClear();
    });

    test('serializes setup completion so concurrent requests cannot create multiple admins', async () => {
        let releaseFirstWrite;
        storageMock.setItem.mockImplementation(async (key, value) => {
            if (key === 'user:first-admin') {
                await new Promise(resolve => {
                    releaseFirstWrite = resolve;
                });
            }
            users.set(key, value);
        });

        const firstSetup = invokeRoute('/setup', createRequest({
            handle: 'first-admin',
            name: 'First Admin',
            password: 'secret12',
        }, '127.0.0.10'));
        const secondSetup = invokeRoute('/setup', createRequest({
            handle: 'second-admin',
            name: 'Second Admin',
            password: 'secret12',
        }, '127.0.0.11'));

        await waitFor(() => typeof releaseFirstWrite === 'function');
        releaseFirstWrite();

        const responses = await Promise.all([firstSetup, secondSetup]);

        expect(responses.map(response => response.statusCode).sort()).toEqual([200, 403]);
        expect(storageMock.setItem).toHaveBeenCalledTimes(1);
        expect(users.has('user:first-admin')).toBe(true);
        expect(users.has('user:second-admin')).toBe(false);

        storageMock.setItem.mockImplementation(async (key, value) => {
            users.set(key, value);
        });
    });

    test('reports completed setup without exposing fresh setup mode', async () => {
        users.set('user:admin', {
            handle: 'admin',
            name: 'Admin',
            password: 'hash:secret12',
            salt: 'salt',
            enabled: true,
        });

        const response = await invokeRoute('/setup-mode', createRequest({}), 'get');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ mode: 'complete' });
    });

    test('rejects weak setup passwords before creating an admin', async () => {
        const response = await invokeRoute('/setup', createRequest({
            handle: 'admin',
            name: 'Admin',
            password: 'short',
        }, '127.0.0.12'));

        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({ error: 'Password must be at least 8 characters long' });
        expect(storageMock.setItem).not.toHaveBeenCalled();
    });

    test('rejects empty or weak recovery passwords without clearing the account password', async () => {
        users.set('user:alice', {
            handle: 'alice',
            name: 'Alice',
            password: 'hash:old-password',
            salt: 'old-salt',
            enabled: true,
        });

        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            const step1 = await invokeRoute('/recover-step1', createRequest({ handle: 'alice' }, '127.0.0.30'));
            expect(step1.statusCode).toBe(204);

            const recoveryLog = consoleLogSpy.mock.calls.flat().join(' ');
            const code = recoveryLog.match(/\d{6}/)?.[0];
            expect(code).toBeDefined();

            const emptyPassword = await invokeRoute('/recover-step2', createRequest({
                handle: 'alice',
                code,
                newPassword: '',
            }, '127.0.0.31'));
            expect(emptyPassword.statusCode).toBe(400);
            expect(emptyPassword.body).toEqual({ error: 'Missing required fields' });
            expect(users.get('user:alice').password).toBe('hash:old-password');

            const weakPassword = await invokeRoute('/recover-step2', createRequest({
                handle: 'alice',
                code,
                newPassword: 'short',
            }, '127.0.0.32'));
            expect(weakPassword.statusCode).toBe(400);
            expect(weakPassword.body).toEqual({ error: 'Password must be at least 8 characters long' });
            expect(users.get('user:alice').password).toBe('hash:old-password');
        } finally {
            consoleLogSpy.mockRestore();
        }
    });

    test('rate limits setup attempts by client IP', async () => {
        const firstResponse = await invokeRoute('/setup', createRequest({}, '127.0.0.20'));
        const secondResponse = await invokeRoute('/setup', createRequest({}, '127.0.0.20'));

        expect(firstResponse.statusCode).toBe(400);
        expect(secondResponse.statusCode).toBe(429);
        expect(secondResponse.body).toEqual({ error: 'Too many setup attempts. Try again later.' });
    });
});
