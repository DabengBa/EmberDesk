import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import express from 'express';
import { afterEach, describe, expect, test } from '@jest/globals';

import { setConfigFilePath } from '../src/util.js';
import {
    EXTENSION_FAILURE_CLASS,
    EXTENSION_REASON,
    buildExtensionFailureEnvelope,
    httpStatusForExtensionDecision,
    inspectExtensionGitState,
    normalizeExtensionFolderName,
    preflightExtensionInstall,
    preflightExtensionMutation,
    resolveExtensionTarget,
} from '../src/extension-operation-safety.js';

const tempRoots = [];
const configTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-ext-ops-config-'));
const configPath = path.join(configTmpDir, 'config.yaml');
fs.writeFileSync(configPath, 'extensions:\n  enabled: true\ngit:\n  backend: system\n', 'utf8');
setConfigFilePath(configPath);

const { router: extensionsRouter } = await import('../src/endpoints/extensions.js');
const { PUBLIC_DIRECTORIES } = await import('../src/constants.js');

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function makeScopeRoots() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-ext-ops-'));
    tempRoots.push(root);
    const userExtensionsDir = path.join(root, 'user', 'extensions');
    const globalExtensionsDir = path.join(root, 'global-extensions');
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    fs.mkdirSync(globalExtensionsDir, { recursive: true });
    return { root, userExtensionsDir, globalExtensionsDir };
}

function createGitDouble({
    isRepo = true,
    remotes = [{ refs: { fetch: 'https://example.test/repo.git' } }],
    status = { isClean: () => true, detached: false, tracking: 'origin/main' },
    branch = {
        current: 'main',
        detached: false,
        all: ['main', 'remotes/origin/main'],
        branches: { main: {}, 'remotes/origin/main': {} },
    },
    throwOnCheckIsRepo = false,
} = {}) {
    const calls = [];
    return {
        calls,
        git: {
            checkIsRepo: async () => {
                calls.push('checkIsRepo');
                if (throwOnCheckIsRepo) {
                    throw new Error('not a git repository');
                }
                return isRepo;
            },
            getRemotes: async () => {
                calls.push('getRemotes');
                return remotes;
            },
            status: async () => {
                calls.push('status');
                return status;
            },
            branch: async () => {
                calls.push('branch');
                return branch;
            },
            fetch: async () => {
                calls.push('fetch');
            },
            pull: async () => {
                calls.push('pull');
            },
            checkout: async () => {
                calls.push('checkout');
            },
        },
    };
}

function listen(app) {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}`,
            });
        });
    });
}

async function withExtensionsApp({ admin = true, userExtensionsDir, handler }) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = {
            profile: { handle: 'tester', admin },
            directories: { extensions: userExtensionsDir },
        };
        next();
    });
    app.use('/api/extensions', extensionsRouter);
    const { server, url } = await listen(app);
    try {
        return await handler(url);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }
    return { status: response.status, text, json };
}

function initDirtyGitRepo(extensionPath) {
    fs.mkdirSync(extensionPath, { recursive: true });
    const run = (args) => {
        const result = spawnSync('git', args, { cwd: extensionPath, encoding: 'utf8' });
        if (result.status !== 0) {
            throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
        }
    };
    run(['init']);
    run(['config', 'user.email', 'test@example.test']);
    run(['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(extensionPath, 'README.md'), 'one\n', 'utf8');
    fs.writeFileSync(path.join(extensionPath, 'manifest.json'), '{}', 'utf8');
    run(['add', 'README.md']);
    run(['add', 'manifest.json']);
    run(['commit', '-m', 'init']);
    run(['branch', '-M', 'main']);
    run(['remote', 'add', 'origin', 'https://example.test/org/dirty-ext.git']);
    fs.writeFileSync(path.join(extensionPath, 'README.md'), 'dirty local edit\n', 'utf8');
}

describe('extension operation safety decisions', () => {
    test('normalizeExtensionFolderName accepts third-party/ and leading slash without stripping folder prefixes', () => {
        expect(normalizeExtensionFolderName('demo-ext')).toBe('demo-ext');
        expect(normalizeExtensionFolderName('third-party/demo-ext')).toBe('demo-ext');
        expect(normalizeExtensionFolderName('/demo-ext')).toBe('demo-ext');
        // Folder names may themselves start with "third-party"; only the discovery prefix is stripped.
        expect(normalizeExtensionFolderName('third-party-helper')).toBe('third-party-helper');
        expect(normalizeExtensionFolderName('valid..name')).toBe('valid..name');
        expect(normalizeExtensionFolderName('../escape')).toBeNull();
        expect(normalizeExtensionFolderName('nested/path')).toBeNull();
    });

    test('resolveExtensionTarget distinguishes global and user scopes and blocks path escape', () => {
        const { userExtensionsDir, globalExtensionsDir } = makeScopeRoots();

        const userTarget = resolveExtensionTarget({
            scope: 'local',
            extensionName: 'demo-ext',
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(userTarget.allowed).toBe(true);
        expect(userTarget.scope).toBe('local');
        expect(userTarget.extensionPath).toBe(path.join(userExtensionsDir, 'demo-ext'));
        expect(userTarget.basePath).toBe(userExtensionsDir);

        const globalTarget = resolveExtensionTarget({
            scope: 'global',
            extensionName: 'demo-ext',
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(globalTarget.allowed).toBe(true);
        expect(globalTarget.scope).toBe('global');
        expect(globalTarget.extensionPath).toBe(path.join(globalExtensionsDir, 'demo-ext'));

        const invalid = resolveExtensionTarget({
            scope: 'local',
            extensionName: '../escape',
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(invalid.allowed).toBe(false);
        expect(invalid.reason).toBe(EXTENSION_REASON.INVALID_EXTENSION_NAME);
        expect(invalid.failureClass).toBe(EXTENSION_FAILURE_CLASS.INVALID_REQUEST);
    });

    test('inspectExtensionGitState reports dirty/detached/no-upstream/missing without mutating', async () => {
        const dirty = createGitDouble({
            status: { isClean: () => false, detached: false, tracking: 'origin/main' },
        });
        await expect(inspectExtensionGitState(dirty.git)).resolves.toMatchObject({
            state: 'dirty',
            reason: EXTENSION_REASON.DIRTY_WORKTREE,
        });
        expect(dirty.calls).not.toContain('fetch');
        expect(dirty.calls).not.toContain('pull');
        expect(dirty.calls).not.toContain('checkout');

        const dirtyNoRemote = createGitDouble({
            remotes: [],
            status: { isClean: () => false, detached: false, tracking: null },
        });
        await expect(inspectExtensionGitState(dirtyNoRemote.git)).resolves.toMatchObject({
            state: 'dirty',
            reason: EXTENSION_REASON.DIRTY_WORKTREE,
        });
        expect(dirtyNoRemote.calls).toContain('status');

        const detached = createGitDouble({
            status: { isClean: () => true, detached: true, tracking: null },
            branch: { current: '', detached: true, all: [], branches: {} },
        });
        await expect(inspectExtensionGitState(detached.git)).resolves.toMatchObject({
            state: 'detached',
            reason: EXTENSION_REASON.DETACHED_HEAD,
        });
        expect(detached.calls).not.toContain('fetch');

        const noUpstream = createGitDouble({
            status: { isClean: () => true, detached: false, tracking: null },
            branch: { current: 'feature', detached: false, all: ['feature'], branches: { feature: {} } },
        });
        await expect(inspectExtensionGitState(noUpstream.git)).resolves.toMatchObject({
            state: 'no-upstream',
            reason: EXTENSION_REASON.MISSING_UPSTREAM,
        });
        expect(noUpstream.calls).not.toContain('fetch');

        const missing = createGitDouble({ isRepo: false });
        await expect(inspectExtensionGitState(missing.git)).resolves.toMatchObject({
            state: 'not-a-repo',
            reason: EXTENSION_REASON.NOT_A_REPO,
        });
    });

    test('preflight install blocks invalid URL, collision, forbidden global, and validates containment', () => {
        const { userExtensionsDir, globalExtensionsDir } = makeScopeRoots();
        fs.mkdirSync(path.join(userExtensionsDir, 'already'), { recursive: true });

        const invalidUrl = preflightExtensionInstall({
            url: 'not-a-url',
            scope: 'local',
            isAdmin: false,
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(invalidUrl).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.INVALID_URL,
            failureClass: EXTENSION_FAILURE_CLASS.INVALID_REQUEST,
            operation: 'install',
        });

        const forbidden = preflightExtensionInstall({
            url: 'https://example.test/org/ext.git',
            scope: 'global',
            isAdmin: false,
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(forbidden).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.FORBIDDEN_GLOBAL,
            failureClass: EXTENSION_FAILURE_CLASS.FORBIDDEN,
            operation: 'install',
            scope: 'global',
        });

        const collision = preflightExtensionInstall({
            url: 'https://example.test/org/already.git',
            scope: 'local',
            isAdmin: false,
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(collision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.PATH_COLLISION,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
            operation: 'install',
        });
        expect(collision.actionHints).toEqual(expect.arrayContaining(['choose_different_name_or_delete_existing']));

        fs.mkdirSync(path.join(globalExtensionsDir, 'global-only'), { recursive: true });
        const crossScopeCollision = preflightExtensionInstall({
            url: 'https://example.test/org/global-only.git',
            scope: 'local',
            isAdmin: false,
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(crossScopeCollision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.PATH_COLLISION,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
        });

        const clean = preflightExtensionInstall({
            url: 'https://example.test/org/fresh-ext.git',
            scope: 'local',
            isAdmin: false,
            userExtensionsDir,
            globalExtensionsDir,
        });
        expect(clean.allowed).toBe(true);
        expect(clean.extensionPath).toBe(path.join(userExtensionsDir, 'fresh-ext'));
        expect(clean.extensionName).toBe('fresh-ext');
        expect(path.relative(userExtensionsDir, clean.extensionPath)).toBe('fresh-ext');
    });

    test('preflight mutation blocks dirty/detached/missing and allows clean update without git mutation', async () => {
        const { userExtensionsDir, globalExtensionsDir } = makeScopeRoots();
        const extensionName = 'demo-ext';
        const extensionPath = path.join(userExtensionsDir, extensionName);
        fs.mkdirSync(extensionPath, { recursive: true });
        fs.writeFileSync(path.join(extensionPath, 'manifest.json'), '{}', 'utf8');

        const missingPath = await preflightExtensionMutation({
            operation: 'update',
            scope: 'local',
            extensionName: 'gone',
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => {
                throw new Error('createGit should not run for missing worktree');
            },
        });
        expect(missingPath).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.MISSING_WORKTREE,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
            operation: 'update',
        });

        const dirtyGit = createGitDouble({
            status: { isClean: () => false, detached: false, tracking: 'origin/main' },
        });
        const dirtyDecision = await preflightExtensionMutation({
            operation: 'update',
            scope: 'local',
            extensionName,
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => dirtyGit.git,
        });
        expect(dirtyDecision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.DIRTY_WORKTREE,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
            operation: 'update',
        });
        expect(dirtyDecision.actionHints).toEqual(expect.arrayContaining(['commit_or_stash_local_changes']));
        expect(dirtyGit.calls).not.toContain('fetch');
        expect(dirtyGit.calls).not.toContain('pull');
        expect(dirtyGit.calls).not.toContain('checkout');

        const detachedGit = createGitDouble({
            status: { isClean: () => true, detached: true, tracking: null },
            branch: { current: '', detached: true, all: [], branches: {} },
        });
        const detachedDecision = await preflightExtensionMutation({
            operation: 'switch',
            scope: 'local',
            extensionName,
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => detachedGit.git,
        });
        expect(detachedDecision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.DETACHED_HEAD,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
            operation: 'switch',
        });

        const cleanGit = createGitDouble();
        const cleanDecision = await preflightExtensionMutation({
            operation: 'update',
            scope: 'local',
            extensionName,
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => cleanGit.git,
        });
        expect(cleanDecision.allowed).toBe(true);
        expect(cleanDecision.reason).toBeNull();
        expect(cleanGit.calls).not.toContain('pull');
        expect(cleanGit.calls).not.toContain('checkout');
    });

    test('move preflight enforces admin, destination collision, and dirty source protection', async () => {
        const { userExtensionsDir, globalExtensionsDir } = makeScopeRoots();
        const extensionName = 'movable';
        fs.mkdirSync(path.join(userExtensionsDir, extensionName), { recursive: true });
        fs.mkdirSync(path.join(globalExtensionsDir, extensionName), { recursive: true });
        fs.writeFileSync(path.join(userExtensionsDir, extensionName, 'manifest.json'), '{}', 'utf8');
        fs.writeFileSync(path.join(globalExtensionsDir, extensionName, 'manifest.json'), '{}', 'utf8');

        const forbidden = await preflightExtensionMutation({
            operation: 'move',
            scope: 'local',
            destinationScope: 'global',
            extensionName,
            isAdmin: false,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => createGitDouble().git,
        });
        expect(forbidden).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.FORBIDDEN_MOVE,
            failureClass: EXTENSION_FAILURE_CLASS.FORBIDDEN,
        });

        const collision = await preflightExtensionMutation({
            operation: 'move',
            scope: 'local',
            destinationScope: 'global',
            extensionName,
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => createGitDouble().git,
        });
        expect(collision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.DESTINATION_EXISTS,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
        });

        fs.rmSync(path.join(globalExtensionsDir, extensionName), { recursive: true, force: true });
        const dirtyGit = createGitDouble({
            status: { isClean: () => false, detached: false, tracking: 'origin/main' },
        });
        const dirtyMove = await preflightExtensionMutation({
            operation: 'move',
            scope: 'local',
            destinationScope: 'global',
            extensionName,
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => dirtyGit.git,
        });
        expect(dirtyMove).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.DIRTY_WORKTREE,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
        });
        expect(dirtyGit.calls).not.toContain('checkout');
    });

    test('preflight blocks symlinked, invalid-manifest, detached, and no-upstream destructive worktrees', async () => {
        const { root, userExtensionsDir, globalExtensionsDir } = makeScopeRoots();
        const outsidePath = path.join(root, 'outside-extension');
        const extensionPath = path.join(userExtensionsDir, 'demo-ext');
        fs.mkdirSync(outsidePath, { recursive: true });
        fs.symlinkSync(outsidePath, extensionPath, 'dir');

        const symlinkDecision = await preflightExtensionMutation({
            operation: 'delete',
            scope: 'local',
            extensionName: 'demo-ext',
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => {
                throw new Error('Git inspection must not follow a symlinked extension root.');
            },
        });
        expect(symlinkDecision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.PATH_ESCAPE,
            failureClass: EXTENSION_FAILURE_CLASS.INVALID_REQUEST,
        });

        fs.rmSync(extensionPath, { recursive: true, force: true });
        fs.mkdirSync(extensionPath, { recursive: true });
        fs.writeFileSync(path.join(extensionPath, 'manifest.json'), '{invalid', 'utf8');
        const invalidManifest = await preflightExtensionMutation({
            operation: 'delete',
            scope: 'local',
            extensionName: 'demo-ext',
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => createGitDouble().git,
        });
        expect(invalidManifest).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.INVALID_MANIFEST,
        });

        fs.writeFileSync(path.join(extensionPath, 'manifest.json'), '{}', 'utf8');
        const detached = createGitDouble({
            status: { isClean: () => true, detached: true, tracking: null },
            branch: { current: '', detached: true, all: [], branches: {} },
        });
        const detachedDecision = await preflightExtensionMutation({
            operation: 'delete',
            scope: 'local',
            extensionName: 'demo-ext',
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => detached.git,
        });
        expect(detachedDecision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.DETACHED_HEAD,
        });

        const noUpstream = createGitDouble({
            status: { isClean: () => true, detached: false, tracking: null },
            branch: { current: 'main', detached: false, all: ['main'], branches: { main: {} } },
        });
        const noUpstreamDecision = await preflightExtensionMutation({
            operation: 'move',
            scope: 'local',
            destinationScope: 'global',
            extensionName: 'demo-ext',
            isAdmin: true,
            userExtensionsDir,
            globalExtensionsDir,
            createGit: () => noUpstream.git,
        });
        expect(noUpstreamDecision).toMatchObject({
            allowed: false,
            reason: EXTENSION_REASON.MISSING_UPSTREAM,
        });
    });

    test('failure envelope and status mapping keep reason/actionHints stable without local paths', () => {
        const decision = {
            allowed: false,
            operation: 'delete',
            scope: 'local',
            extensionName: 'demo-ext',
            reason: EXTENSION_REASON.DIRTY_WORKTREE,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
            actionHints: ['commit_or_stash_local_changes', 'retry_after_clean'],
            extensionPath: '/home/secret/user/extensions/demo-ext',
        };

        const envelope = buildExtensionFailureEnvelope(decision);
        expect(envelope).toEqual({
            ok: false,
            operation: 'delete',
            scope: 'local',
            extensionName: 'demo-ext',
            reason: EXTENSION_REASON.DIRTY_WORKTREE,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
            actionHints: ['commit_or_stash_local_changes', 'retry_after_clean'],
            message: expect.stringContaining('local uncommitted changes'),
        });
        expect(JSON.stringify(envelope)).not.toContain('/home/secret');
        expect(httpStatusForExtensionDecision(decision)).toBe(409);

        const forbidden = {
            allowed: false,
            operation: 'install',
            scope: 'global',
            extensionName: null,
            reason: EXTENSION_REASON.FORBIDDEN_GLOBAL,
            failureClass: EXTENSION_FAILURE_CLASS.FORBIDDEN,
            actionHints: ['use_admin_account'],
        };
        expect(httpStatusForExtensionDecision(forbidden)).toBe(403);

        const invalid = {
            allowed: false,
            operation: 'install',
            scope: 'local',
            extensionName: null,
            reason: EXTENSION_REASON.INVALID_URL,
            failureClass: EXTENSION_FAILURE_CLASS.INVALID_REQUEST,
            actionHints: ['provide_http_https_git_url'],
        };
        expect(httpStatusForExtensionDecision(invalid)).toBe(400);

        const missing = {
            allowed: false,
            operation: 'update',
            scope: 'local',
            extensionName: 'gone',
            reason: EXTENSION_REASON.MISSING_WORKTREE,
            failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
            actionHints: ['reinstall_extension'],
        };
        expect(httpStatusForExtensionDecision(missing)).toBe(404);
    });
});

describe('extension operation routes', () => {
    test('forbids non-admin global install with structured envelope', async () => {
        const { userExtensionsDir } = makeScopeRoots();
        await withExtensionsApp({
            admin: false,
            userExtensionsDir,
            handler: async (baseUrl) => {
                const result = await postJson(`${baseUrl}/api/extensions/install`, {
                    url: 'https://example.test/org/ext.git',
                    global: true,
                });
                expect(result.status).toBe(403);
                expect(result.json).toMatchObject({
                    ok: false,
                    operation: 'install',
                    scope: 'global',
                    reason: EXTENSION_REASON.FORBIDDEN_GLOBAL,
                    failureClass: EXTENSION_FAILURE_CLASS.FORBIDDEN,
                });
                expect(JSON.stringify(result.json)).not.toMatch(/\/home\/|C:\\\\/);
            },
        });
    });

    test('blocks dirty local delete without removing worktree', async () => {
        const { userExtensionsDir } = makeScopeRoots();
        const extensionPath = path.join(userExtensionsDir, 'dirty-ext');
        initDirtyGitRepo(extensionPath);

        await withExtensionsApp({
            admin: true,
            userExtensionsDir,
            handler: async (baseUrl) => {
                const result = await postJson(`${baseUrl}/api/extensions/delete`, {
                    extensionName: 'dirty-ext',
                    global: false,
                });
                expect(result.status).toBe(409);
                expect(result.json).toMatchObject({
                    ok: false,
                    operation: 'delete',
                    reason: EXTENSION_REASON.DIRTY_WORKTREE,
                    failureClass: EXTENSION_FAILURE_CLASS.USER_ACTION_REQUIRED,
                });
                expect(fs.existsSync(path.join(extensionPath, 'README.md'))).toBe(true);
                expect(fs.readFileSync(path.join(extensionPath, 'README.md'), 'utf8')).toBe('dirty local edit\n');
            },
        });
    });

    test('deletes clean non-git local extension and keeps success text shape', async () => {
        const { userExtensionsDir } = makeScopeRoots();
        const extensionPath = path.join(userExtensionsDir, 'plain-ext');
        fs.mkdirSync(extensionPath, { recursive: true });
        fs.writeFileSync(path.join(extensionPath, 'manifest.json'), '{"display_name":"Plain"}', 'utf8');

        await withExtensionsApp({
            admin: true,
            userExtensionsDir,
            handler: async (baseUrl) => {
                const result = await postJson(`${baseUrl}/api/extensions/delete`, {
                    extensionName: 'plain-ext',
                    global: false,
                });
                expect(result.status).toBe(200);
                expect(result.text).toContain('Extension has been deleted at');
                expect(fs.existsSync(extensionPath)).toBe(false);
            },
        });
    });

    test('forbids non-admin move with structured envelope', async () => {
        const { userExtensionsDir, globalExtensionsDir } = makeScopeRoots();
        fs.mkdirSync(path.join(userExtensionsDir, 'movable'), { recursive: true });
        fs.writeFileSync(path.join(userExtensionsDir, 'movable', 'manifest.json'), '{}', 'utf8');
        await withExtensionsApp({
            admin: false,
            userExtensionsDir,
            handler: async (baseUrl) => {
                const result = await postJson(`${baseUrl}/api/extensions/move`, {
                    extensionName: 'movable',
                    source: 'local',
                    destination: 'global',
                });
                expect(result.status).toBe(403);
                expect(result.json).toMatchObject({
                    ok: false,
                    operation: 'move',
                    reason: EXTENSION_REASON.FORBIDDEN_MOVE,
                    failureClass: EXTENSION_FAILURE_CLASS.FORBIDDEN,
                });
                expect(fs.existsSync(path.join(userExtensionsDir, 'movable'))).toBe(true);
            },
        });
        expect(globalExtensionsDir).toBeTruthy();
        expect(PUBLIC_DIRECTORIES.globalExtensions).toBeTruthy();
    });
});
