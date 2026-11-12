import { afterAll, beforeAll, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import compression from 'compression';
import cookieSession from 'cookie-session';
import { csrfSync } from 'csrf-sync';
import storage from 'node-persist';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import { canonicalSqliteManager } from '../src/canonical-sqlite.js';
import { getPersistedCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';
import { upsertCanonicalSettingsDocument } from '../src/endpoints/settings-store.js';
import { setConfigFilePath } from '../src/util.js';
import { createCharacterLibraryChangeObserver } from '../src/character-library-change-observer.js';
import { createCharacterLibraryEventsHandler } from '../src/endpoints/character-library-events.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-events-'));
fs.writeFileSync(path.join(root, 'config.yaml'), 'enableUserAccounts: true\n');
setConfigFilePath(path.join(root, 'config.yaml'));
globalThis.DATA_ROOT = root;
const { setUserDataMiddleware, requireLoginMiddleware, getUserDirectories, getAccountVersion } = await import('../src/users.js');
const { router: charactersRouter } = await import('../src/endpoints/characters.js');
const user = { handle: 'alice', enabled: true, password: 'hash', salt: 'salt' };
const service = createCharacterLibraryChangeObserver({ pollMs: 10, lifetimeMs: 300, maxPerUser: 2 });
let server; let url; let db; let cookie;
let csrfToken;
const requests = new Set();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await pause(10); } throw new Error('HTTP event timeout'); }
function stream(headers = {}, suffix = '') {
    return new Promise((resolve, reject) => {
        const req = http.get(url + '/api/characters/events' + suffix, { headers: { Cookie: cookie, ...headers } }, res => {
            const result = { res, text: '', ended: false, req };
            res.setEncoding('utf8'); res.on('data', chunk => { result.text += chunk; });
            res.on('end', () => { result.ended = true; });
            res.on('error', () => { result.ended = true; });
            resolve(result);
        });
        requests.add(req); req.on('error', reject);
    });
}
beforeAll(async () => {
    await storage.init({ dir: path.join(root, 'users'), ttl: false });
    await storage.setItem('user:alice', user);
    const directories = getUserDirectories('alice');
    fs.mkdirSync(directories.storage, { recursive: true });
    db = new DatabaseSync(path.join(directories.storage, 'emberdesk.sqlite'));
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE changes (value TEXT)');
    runCanonicalMigrations(db);
    for (const directory of Object.values(directories)) fs.mkdirSync(directory, { recursive: true });
    const app = express();
    app.use(compression());
    app.use(cookieSession({ name: 'session', keys: ['isolated-test-key'] }));
    // Only fixture credential issuance is synthetic; signed session validation,
    // account lookup and private-route authorization below are production code.
    app.get('/fixture-session', (req, res) => { req.session = { handle: 'alice', version: getAccountVersion(user) }; res.sendStatus(200); });
    app.use(setUserDataMiddleware);
    const csrf = csrfSync({
        getTokenFromState: req => req.session.csrfToken,
        getTokenFromRequest: req => req.headers['x-csrf-token'],
        storeTokenInState: (req, token) => { req.session.csrfToken = token; },
    });
    app.get('/csrf-token', (req, res) => res.json({ token: csrf.generateToken(req) }));
    app.use(csrf.csrfSynchronisedProtection, requireLoginMiddleware);
    app.get('/api/characters/events', createCharacterLibraryEventsHandler(service, { heartbeatMs: 20 }));
    app.use('/api/characters', charactersRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(url + '/fixture-session');
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const tokenResponse = await fetch(url + '/csrf-token', { headers: { Cookie: cookie } });
    csrfToken = (await tokenResponse.json()).token;
    cookie = tokenResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
});
afterAll(async () => {
    for (const req of requests) req.destroy();
    service.dispose(); canonicalSqliteManager.dispose(); if (db?.isOpen) db.close();
    server?.closeAllConnections();
    if (server) await new Promise(resolve => server.close(resolve));
    await storage.clear(); fs.rmSync(root, { recursive: true, force: true });
});

test('real signed authentication, compression, ready, heartbeat, commit and reconnect', async () => {
    const denied = await stream({ Cookie: '' });
    expect(denied.res.statusCode).toBe(403);
    const live = await stream({ 'Accept-Encoding': 'gzip' }, '?handle=elsewhere&path=/tmp/foreign');
    await until(() => live.text.includes('event: ready'));
    expect(live.res.headers['content-encoding']).toBeUndefined();
    expect(live.res.headers['cache-control']).toContain('no-transform');
    await until(() => live.text.includes(': heartbeat'));
    db.exec("INSERT INTO changes VALUES ('secret')");
    await until(() => live.text.includes('event: invalidate'));
    expect(live.text).not.toMatch(/secret|alice|emberdesk|id:|\/tmp\//);
    live.req.destroy(); await pause(30);
    db.exec("INSERT INTO changes VALUES ('offline')");
    const again = await stream();
    await until(() => again.text.includes('event: ready'));
    expect(db.prepare('SELECT COUNT(*) AS n FROM changes').get().n).toBe(2);
    await storage.setItem('user:alice', { ...user, enabled: false });
    await until(() => again.ended);
    expect((await stream()).res.statusCode).toBe(403);
    await storage.setItem('user:alice', { ...user, password: 'changed' });
    expect((await stream()).res.statusCode).toBe(403);
    await storage.setItem('user:alice', user);
});

test('quota rejects before SSE headers and client disconnect releases a slot', async () => {
    const a = await stream(); const b = await stream();
    expect((await stream()).res.statusCode).toBe(429);
    a.req.destroy(); await pause(30);
    const c = await stream(); expect(c.res.statusCode).toBe(200);
    b.req.destroy(); c.req.destroy(); await pause(30);
});

test('actual list read audit converges; unrelated settings writes produce coarse hints', async () => {
    const live = await stream(); await until(() => live.text.includes('event: ready'));
    const count = () => (live.text.match(/event: invalidate/g) ?? []).length;
    expect(getPersistedCanonicalAuditStatus(db).status).toBe('missing');
    const read = async () => {
        const result = await fetch(url + '/api/characters/all', { method: 'POST', headers: { Cookie: cookie, 'x-csrf-token': csrfToken } });
        expect(result.status).toBe(200); await result.json();
    };
    await read(); await until(() => count() > 0);
    const afterAudit = count();
    for (let i = 0; i < 3; i++) { await read(); await pause(20); }
    expect(count()).toBe(afterAudit);
    for (let i = 0; i < 2; i++) {
        upsertCanonicalSettingsDocument(db, { userId: 'alice', payload: { unrelated: i }, expectedRevision: i });
        await until(() => count() === afterAudit + i + 1);
    }
    console.info(JSON.stringify({ auditNotifications: afterAudit, repeatedReadNotifications: 0, unrelatedSettingsWrites: 2, unrelatedSettingsNotifications: count() - afterAudit }));
    live.req.destroy(); await pause(20);
});

test('handshake errors and backpressure release subscriptions', () => {
    const directories = getUserDirectories('alice');
    for (const failure of ['headers', 'backpressure']) {
        let active = 0;
        const observer = { subscribe() { active++; return () => active--; } };
        const response = new EventEmitter();
        Object.assign(response, {
            status() { return this; }, set() { return this; },
            flushHeaders() { if (failure === 'headers') throw new Error('socket failed'); },
            write() { return false; }, destroy() {},
        });
        try { createCharacterLibraryEventsHandler(observer)({ user: { directories } }, response); } catch { /* Assert cleanup even on transport failure. */ }
        expect(active).toBe(0);
    }
});

test('production router mounts the SSE handler; commit during header flush follows ready', async () => {
    const { characterLibraryEventsHandler } = await import('../src/endpoints/character-library-events.js');
    expect(charactersRouter.stack.find(layer => layer.route?.path === '/events').route.stack[0].handle).toBe(characterLibraryEventsHandler);
    const response = new EventEmitter(); const frames = [];
    const local = createCharacterLibraryChangeObserver({ pollMs: 10 });
    Object.assign(response, {
        status() { return this; }, set() { return this; },
        flushHeaders() { db.exec("INSERT INTO changes VALUES ('handshake')"); },
        write(frame) { frames.push(frame); return true; }, destroy() {},
    });
    try {
        createCharacterLibraryEventsHandler(local)({ user: { directories: getUserDirectories('alice') } }, response);
        expect(frames[0]).toBe('event: ready\ndata: {}\n\n');
        await until(() => frames.some(frame => frame.includes('invalidate')));
    } finally { local.dispose(); }
});

test('actual production router serves authenticated SSE over HTTP', async () => {
    const { characterLibraryChangeObserver } = await import('../src/character-library-change-observer.js');
    const app = express();
    app.use(compression());
    app.use(cookieSession({ name: 'session', keys: ['isolated-test-key'] }));
    app.use(setUserDataMiddleware, requireLoginMiddleware);
    app.use('/api/characters', charactersRouter);
    const actualServer = app.listen(0, '127.0.0.1');
    await new Promise(resolve => actualServer.once('listening', resolve));
    try {
        const actual = await new Promise((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${actualServer.address().port}/api/characters/events`, { headers: { Cookie: cookie, 'Accept-Encoding': 'gzip' } }, res => {
                let text = '';
                res.on('data', chunk => { text += chunk; if (text.includes('event: ready')) resolve({ req, res, text }); });
            });
            req.on('error', reject);
        });
        expect(actual.res.statusCode).toBe(200);
        expect(actual.res.headers['content-encoding']).toBeUndefined();
        actual.req.destroy();
    } finally {
        characterLibraryChangeObserver.dispose();
        actualServer.closeAllConnections();
        await new Promise(resolve => actualServer.close(resolve));
    }
});
test('opening failure is 503 without event-stream headers and without creating a database', async () => {
    canonicalSqliteManager.dispose(); db.close();
    const file = path.join(getUserDirectories('alice').storage, 'emberdesk.sqlite');
    fs.renameSync(file, file + '.offline');
    const res = await stream(); expect(res.res.statusCode).toBe(503);
    expect(res.res.headers['content-type']).not.toContain('text/event-stream');
    expect(fs.existsSync(file)).toBe(false);
});
