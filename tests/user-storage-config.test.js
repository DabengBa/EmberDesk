import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const storageMock = {
    init: jest.fn(async () => {}),
    keys: jest.fn(async () => []),
    setItem: jest.fn(async () => {}),
    getItem: jest.fn(async () => undefined),
    values: jest.fn(async () => []),
};

const getConfigValueMock = jest.fn((_key, defaultValue) => defaultValue);

jest.unstable_mockModule('node-persist', () => ({
    default: storageMock,
}));

jest.unstable_mockModule('../src/util.js', () => ({
    getConfigValue: getConfigValueMock,
}));

let userStorage;

describe('user storage account configuration', () => {
    beforeEach(async () => {
        jest.resetModules();
        for (const mock of Object.values(storageMock)) mock.mockReset();
        storageMock.keys.mockResolvedValue([]);
        storageMock.values.mockResolvedValue([]);
        getConfigValueMock.mockReset().mockImplementation((_key, defaultValue) => defaultValue);
        userStorage = await import('../src/user-storage.ts');
    });

    test('reads configuration lazily and caches its first value', () => {
        expect(getConfigValueMock).not.toHaveBeenCalled();
        expect(userStorage.getEnableAccounts()).toBe(false);
        expect(getConfigValueMock).toHaveBeenCalledWith('enableUserAccounts', false, 'boolean');
        getConfigValueMock.mockReturnValue(true);
        expect(userStorage.getEnableAccounts()).toBe(false);
        expect(getConfigValueMock).toHaveBeenCalledTimes(1);
    });

    test('creates the legacy default user when account storage starts empty and accounts are disabled', async () => {
        await userStorage.initUserStorage('D:/data');

        expect(storageMock.init).toHaveBeenCalledWith({
            dir: expect.stringContaining('_storage'),
            ttl: false,
            expiredInterval: 0,
        });
        expect(storageMock.setItem).toHaveBeenCalledWith('user:default-user', expect.objectContaining({
            handle: 'default-user',
        }));
    });

    test('does not create a default user when a user already exists or accounts are enabled', async () => {
        storageMock.keys.mockResolvedValue(['user:alice']);
        await userStorage.initUserStorage('D:/data');
        expect(storageMock.setItem).not.toHaveBeenCalled();
        jest.resetModules();
        getConfigValueMock.mockReturnValue(true);
        storageMock.keys.mockResolvedValue([]);
        userStorage = await import('../src/user-storage.ts');
        await userStorage.initUserStorage('D:/data');
        expect(storageMock.setItem).not.toHaveBeenCalled();
    });

    test('lists only prefixed handles through the storage filter', async () => {
        storageMock.keys.mockImplementation(async filter => ['user:alice', 'avatar:alice', 'user:bob']
            .filter(key => filter({ key })));
        await expect(userStorage.getAllUserHandles()).resolves.toEqual(['alice', 'bob']);
    });

    test('skips setup and enabled user reads when accounts are disabled', async () => {
        await expect(userStorage.needsSetup()).resolves.toBe(false);
        await expect(userStorage.getAllEnabledUsers()).resolves.toEqual([]);
        expect(storageMock.keys).not.toHaveBeenCalled();
        expect(storageMock.values).not.toHaveBeenCalled();
    });

    test('checks fresh, single unprotected, protected and multiple-user setup cases', async () => {
        getConfigValueMock.mockReturnValue(true);
        await expect(userStorage.needsSetup()).resolves.toBe(true);
        storageMock.keys.mockResolvedValue(['user:alice']);
        const user = { handle: 'alice', name: 'Alice', created: 1, password: '', salt: '', enabled: true, admin: false };
        storageMock.getItem.mockResolvedValue(user);
        await expect(userStorage.needsSetup()).resolves.toBe(true);
        expect(storageMock.getItem).toHaveBeenCalledWith('user:alice');
        storageMock.getItem.mockResolvedValue({ ...user, password: 'hash' });
        await expect(userStorage.needsSetup()).resolves.toBe(false);
        storageMock.getItem.mockResolvedValue(undefined);
        await expect(userStorage.needsSetup()).resolves.toBe(false);
        storageMock.keys.mockResolvedValue(['user:alice', 'user:bob']);
        await expect(userStorage.needsSetup()).resolves.toBe(false);
    });

    test('returns only enabled values when accounts are enabled', async () => {
        getConfigValueMock.mockReturnValue(true);
        const enabled = { handle: 'alice', name: 'Alice', created: 1, password: '', salt: '', enabled: true, admin: false };
        const disabled = { ...enabled, handle: 'bob', enabled: false };
        storageMock.values.mockResolvedValue([enabled, disabled]);
        await expect(userStorage.getAllEnabledUsers()).resolves.toEqual([enabled]);
    });
});
