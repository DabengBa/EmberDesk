import { expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('native Node executes the security modules and their real call chain', () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-security-native-'));
    try {
        fs.writeFileSync(path.join(dataRoot, 'config.jsonc'), JSON.stringify({
            whitelist: ['127.0.0.1'],
            whitelistDockerHosts: false,
            enableForwardedWhitelist: true,
            hostWhitelist: {
                enabled: true,
                hosts: ['localhost'],
                scan: false,
            },
            privateAddressWhitelist: {
                enabled: false,
            },
        }));
        const script = `
            import assert from 'node:assert/strict';
            import http from 'node:http';
            import https from 'node:https';
            import path from 'node:path';
            import express from 'express';
            globalThis.DATA_ROOT = process.env.SECURITY_TEST_ROOT;
            const { setConfigFilePath } = await import('./src/util.ts');
            setConfigFilePath(path.join(globalThis.DATA_ROOT, 'config.jsonc'));
            const { default: whitelist } = await import('./src/middleware/whitelist.ts');
            const { default: hostWhitelist } = await import('./src/middleware/hostWhitelist.ts');
            const { default: corsProxy } = await import('./src/middleware/corsProxy.ts');
            const { default: filter, PrivateRequestAgent } = await import('./src/private-request-filter.ts');
            const { default: proxy } = await import('./src/request-proxy.ts');
            const app = express();
            app.use(await whitelist());
            app.use(hostWhitelist);
            app.use('/proxy/*url', corsProxy);
            app.get('/ok', (_req, res) => res.send('ok'));
            const server = http.createServer(app);
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
            try {
                const port = server.address().port;
                const request = (pathname, headers = {}) => new Promise((resolve, reject) => {
                    http.get({ host: '127.0.0.1', port, path: pathname, headers: { host: 'localhost', ...headers }, agent: false }, response => {
                        response.resume(); response.on('end', () => resolve(response.statusCode));
                    }).on('error', reject);
                });
                assert.equal(await request('/ok'), 200);
                assert.equal(await request('/ok', { 'x-real-ip': '10.0.0.5' }), 403);
                assert.equal(await request('/ok', { host: 'untrusted.example' }), 403);
                assert.equal(await request('/proxy/http://127.0.0.1:1/a'), 403);
                filter({ listen: false, enabled: true, privateAddressWhitelist: [], logBlocked: false, logAllowed: false, allowUnresolvedHosts: false, enableKeepAlive: false });
                const filtered = http.globalAgent;
                assert.ok(filtered instanceof PrivateRequestAgent);
                await assert.rejects(filtered.connect({}, { host: '127.0.0.1', secureEndpoint: false }), /Blocked request to private IP address/);
                // Use a local stand-in proxy, and never forward the request to its target.
                for (const key of Object.keys(process.env)) {
                    if (/^(all|http|https|no)_proxy$/i.test(key)) delete process.env[key];
                }
                const proxyRequests = [];
                const proxyServer = http.createServer((req, res) => {
                    proxyRequests.push(req.url);
                    res.writeHead(204).end();
                });
                await new Promise((resolve, reject) => { proxyServer.once('error', reject); proxyServer.listen(0, '127.0.0.1', resolve); });
                try {
                    proxy({ enabled: true, url: 'http://127.0.0.1:' + proxyServer.address().port, bypass: ['127.0.0.1'], enableKeepAlive: false, privateRequestFilterEnabled: true });
                    assert.equal(http.globalAgent, https.globalAgent);
                    assert.equal(http.globalAgent.httpAgent, filtered);
                    assert.equal(http.globalAgent.httpsAgent, filtered);
                    const outgoing = url => new Promise((resolve, reject) => {
                        http.get(url, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); }).on('error', reject);
                    });
                    await assert.rejects(outgoing('http://127.0.0.1:' + port + '/ok'), /Blocked request to private IP address/);
                    assert.equal(proxyRequests.length, 0);
                    assert.equal(await outgoing('http://127.0.0.2:' + port + '/via-proxy'), 204);
                    assert.deepEqual(proxyRequests, ['http://127.0.0.2:' + port + '/via-proxy']);
                } finally {
                    http.globalAgent.destroy();
                    await new Promise(resolve => proxyServer.close(resolve));
                }
            } finally {
                await new Promise(resolve => server.close(resolve));
            }
        `;
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: root,
            env: { ...process.env, SECURITY_TEST_ROOT: dataRoot },
            encoding: 'utf8',
            timeout: 15000,
        });
        if (child.status !== 0) {
            throw new Error(`Native subprocess failed (status ${child.status}): ${child.error?.message ?? ''}\n${child.stderr}\n${child.stdout}`);
        }
        expect(child.status).toBe(0);
    } finally {
        fs.rmSync(dataRoot, { recursive: true, force: true });
    }
});
