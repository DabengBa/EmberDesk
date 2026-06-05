import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const storageMock = {
    init: jest.fn(async () => {}),
    keys: jest.fn(async () => []),
    setItem: jest.fn(async () => {}),
};

const getConfigValueMock = jest.fn((_key, defaultValue) => defaultValue);

jest.unstable_mockModule('node-persist', () => ({
    default: storageMock,
}));

jest.unstable_mockModule('../src/util.js', () => ({
    getConfigValue: getConfigValueMock,
}));

const userStorage = await import('../src/user-storage.js');

describe('user storage account configuration', () => {
    beforeEach(() => {
        storageMock.init.mockClear();
        storageMock.keys.mockClear();
        storageMock.setItem.mockClear();
        getConfigValueMock.mockClear();
    });

    test('keeps accounts disabled when enableUserAccounts is omitted', () => {
        expect(userStorage.getEnableAccounts()).toBe(false);
        expect(getConfigValueMock).toHaveBeenCalledWith('enableUserAccounts', false, 'boolean');
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
});
