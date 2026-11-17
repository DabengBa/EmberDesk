import { afterEach, describe, expect, test } from '@jest/globals';
import http from 'node:http';
import https from 'node:https';
import initRequestProxy from '../src/request-proxy.ts';

const originalHttp = http.globalAgent;
const originalHttps = https.globalAgent;
const originalAllProxy = process.env.all_proxy;
const originalNoProxy = process.env.no_proxy;

afterEach(() => {
    http.globalAgent = originalHttp;
    https.globalAgent = originalHttps;
    if (originalAllProxy === undefined) delete process.env.all_proxy;
    else process.env.all_proxy = originalAllProxy;
    if (originalNoProxy === undefined) delete process.env.no_proxy;
    else process.env.no_proxy = originalNoProxy;
});

describe('request proxy initialization', () => {
    test('retains previously installed agents for bypass traffic', () => {
        const priorHttp = new http.Agent();
        const priorHttps = new https.Agent();
        http.globalAgent = priorHttp;
        https.globalAgent = priorHttps;
        initRequestProxy({ enabled: true, url: 'http://proxy.example:8080', bypass: ['example.test'], enableKeepAlive: false, privateRequestFilterEnabled: true });
        expect(http.globalAgent).toBe(https.globalAgent);
        expect(http.globalAgent.httpAgent).toBe(priorHttp);
        expect(http.globalAgent.httpsAgent).toBe(priorHttps);
        expect(process.env.all_proxy).toBe('http://proxy.example:8080');
        expect(process.env.no_proxy).toBe('example.test');
    });
});
