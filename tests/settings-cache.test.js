import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('settings cache invalidation', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('does not repopulate cache with a stale payload after invalidation during rebuild', async () => {
        const {
            getCachedPayload,
            invalidateDirectory,
        } = await import('../src/endpoints/settings-cache.js');

        let resolveFirst;
        const firstGate = new Promise(resolve => {
            resolveFirst = resolve;
        });
        let calls = 0;

        const firstFetch = getCachedPayload('/tmp/worlds', async () => {
            calls++;
            await firstGate;
            return { revision: 'stale' };
        });

        invalidateDirectory('/tmp/worlds');

        const secondFetch = getCachedPayload('/tmp/worlds', async () => {
            calls++;
            return { revision: 'fresh' };
        });

        resolveFirst();

        await expect(firstFetch).resolves.toEqual({ revision: 'stale' });
        await expect(secondFetch).resolves.toEqual({ revision: 'fresh' });

        await expect(getCachedPayload('/tmp/worlds', async () => {
            throw new Error('cache should have kept the fresh payload');
        })).resolves.toEqual({ revision: 'fresh' });
        expect(calls).toBe(2);
    });

    test('rebuilds cached payloads after the TTL expires', async () => {
        const {
            getCachedPayload,
        } = await import('../src/endpoints/settings-cache.js');

        let calls = 0;
        await expect(getCachedPayload('/tmp/themes', async () => {
            calls++;
            return { revision: calls };
        }, { ttlMs: 1 })).resolves.toEqual({ revision: 1 });

        await new Promise(resolve => setTimeout(resolve, 5));

        await expect(getCachedPayload('/tmp/themes', async () => {
            calls++;
            return { revision: calls };
        }, { ttlMs: 1 })).resolves.toEqual({ revision: 2 });
        expect(calls).toBe(2);
    });
});
