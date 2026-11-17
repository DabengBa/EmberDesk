import { describe, expect, jest, test } from '@jest/globals';

const settings = {
    whitelist: ['127.0.0.1'],
    enableForwardedWhitelist: true,
    whitelistDockerHosts: false,
    'forwardedHeaders.xRealIp': true,
    'forwardedHeaders.cfConnectingIp': false,
    'forwardedHeaders.xForwardedFor': true,
    'hostWhitelist.enabled': true,
    'hostWhitelist.hosts': ['trusted.example'],
    'hostWhitelist.scan': false,
};

jest.unstable_mockModule('../src/util.js', () => ({
    color: { red: value => value, yellow: value => value, green: value => value },
    getConfigValue: (key, fallback) => settings[key] ?? fallback,
    safeReadFileSync: () => '',
}));

const { default: getWhitelistMiddleware } = await import('../src/middleware/whitelist.ts');
const { default: hostWhitelistMiddleware } = await import('../src/middleware/hostWhitelist.ts');
globalThis.DATA_ROOT = process.env.DATA_ROOT;

describe('independent inbound security checks', () => {
    test('checks both socket and enabled forwarded IP against the whitelist', async () => {
        const middleware = await getWhitelistMiddleware();
        const next = jest.fn();
        const response = { status: jest.fn().mockReturnThis(), send: jest.fn() };
        const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-real-ip': '10.0.0.5' }, path: '/favicon.ico' };
        middleware(request, response, next);
        expect(response.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
        request.headers['x-real-ip'] = '127.0.0.1';
        middleware(request, response, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('checks Host separately from IP', async () => {
        const next = jest.fn();
        const response = { writeHead: jest.fn(), end: jest.fn() };
        await hostWhitelistMiddleware({ headers: { host: 'untrusted.example' } }, response, next);
        expect(response.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
        expect(next).not.toHaveBeenCalled();
        await hostWhitelistMiddleware({ headers: { host: 'trusted.example' } }, response, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
