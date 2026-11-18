import http from 'node:http';
import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { ProxyAgent } from 'proxy-agent';
import { fetchExternalResource } from '../src/endpoints/external-content-import-service.ts';

let server;
let url;
let requests = 0;

beforeAll(async () => {
    server = http.createServer((_request, response) => {
        requests++;
        response.end('private');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/private`;
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
});

test('external content cannot reach a local service when the global filter is disabled', async () => {
    const result = await fetchExternalResource({ url });
    expect(result.ok).toBe(false);
    expect(result.failure.kind).toBe('network_error');
    expect(requests).toBe(0);
});

test.each(['0.0.0.0', '[::ffff:127.0.0.1]'])('external content cannot reach a local service through %s', async host => {
    const target = `http://${host}:${server.address().port}/private`;
    const before = requests;
    const result = await fetchExternalResource({ url: target });
    expect(result.ok).toBe(false);
    expect(requests).toBe(before);
});

test('fails closed rather than bypassing a proxy that would resolve the import destination', async () => {
    const oldAgent = http.globalAgent;
    const proxy = new ProxyAgent({ getProxyForUrl: () => url });
    http.globalAgent = proxy;
    const before = requests;
    try {
        const result = await fetchExternalResource({ url: 'http://example.test/file' });
        expect(result.ok).toBe(false);
        expect(result.failure.message).toContain('unverified proxy');
        expect(requests).toBe(before);
    } finally {
        http.globalAgent = oldAgent;
        proxy.destroy();
    }
});
