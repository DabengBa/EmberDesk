import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('extension host domain and services', () => {
    test('domain module owns pure lifecycle/operation helpers without DOM access', async () => {
        const domain = await import(`../public/scripts/extension-host-domain.js?t=${Date.now()}`);

        expect(domain.isOfficialExtension('https://github.com/DabengBa/SomeExt')).toBe(true);
        expect(domain.isOfficialExtension('https://github.com/other/SomeExt')).toBe(false);
        expect(domain.isOfficialExtension('not-a-url')).toBe(false);

        expect(domain.getNameSelector('third-party/MyExt')).toMatch(/MyExt/);
        expect(domain.getNameSelector('MyExt', { prefix: '' })).toMatch(/MyExt/);

        const sortedByOrder = [
            { display_name: 'B', loading_order: 20 },
            { display_name: 'A', loading_order: 10 },
        ].sort(domain.sortManifestsByOrder);
        expect(sortedByOrder.map(x => x.display_name)).toEqual(['A', 'B']);

        const sortedByName = [
            { display_name: 'zeta', loading_order: 1 },
            { display_name: 'Alpha', loading_order: 2 },
        ].sort(domain.sortManifestsByName);
        expect(sortedByName.map(x => x.display_name)).toEqual(['Alpha', 'zeta']);

        const decision = domain.evaluateExtensionActivation({
            name: 'third-party/demo',
            manifest: {
                display_name: 'Demo',
                requires: ['module-a'],
                dependencies: ['third-party/dep'],
                minimum_client_version: '1.0.0',
            },
            clientVersion: '1.2.0',
            extrasModules: ['module-a'],
            knownExtensionNames: ['third-party/demo', 'third-party/dep'],
            disabledExtensions: [],
            isAlreadyActive: false,
        });
        expect(decision).toMatchObject({ shouldActivate: true, isDisabled: false });

        const blocked = domain.evaluateExtensionActivation({
            name: 'third-party/demo',
            manifest: {
                display_name: 'Demo',
                requires: ['missing-module'],
                dependencies: [],
            },
            clientVersion: '1.0.0',
            extrasModules: [],
            knownExtensionNames: ['third-party/demo'],
            disabledExtensions: [],
            isAlreadyActive: false,
        });
        expect(blocked.shouldActivate).toBe(false);
        expect(blocked.missingModules).toEqual(['missing-module']);

        const envelope = domain.parseExtensionOperationErrorBody(
            JSON.stringify({
                ok: false,
                message: 'dirty tree',
                reason: 'dirty-worktree',
                failureClass: 'user_action_required',
                actionHints: ['commit_or_stash_local_changes', 'retry_after_clean'],
            }),
            'Bad Request',
        );
        expect(envelope).toMatchObject({
            message: 'dirty tree',
            reason: 'dirty-worktree',
            failureClass: 'user_action_required',
            actionHints: ['commit_or_stash_local_changes', 'retry_after_clean'],
        });

        const plain = domain.parseExtensionOperationErrorBody('legacy plain failure', 'Server Error');
        expect(plain).toMatchObject({
            message: 'legacy plain failure',
            reason: null,
            failureClass: null,
            actionHints: [],
        });

        const feedback = domain.buildExtensionOperationFailureFeedback(envelope, {
            reasonMessages: { 'dirty-worktree': 'dirty message' },
            actionHintMessages: {
                commit_or_stash_local_changes: 'stash first',
                retry_after_clean: 'retry later',
            },
            fallbackMessage: 'failed',
        });
        expect(feedback.failureClass).toBe('user_action_required');
        expect(feedback.reasonMessage).toBe('dirty message');
        expect(feedback.hintMessages).toEqual(['stash first', 'retry later']);
        expect(feedback.message).toContain('dirty message');
        expect(feedback.message).toContain('stash first');

        const author = domain.getAuthorFromUrl('https://github.com/SomeOrg/SomeRepo');
        expect(author).toEqual({ name: 'SomeOrg', url: 'https://github.com/SomeOrg' });
        expect(domain.EMPTY_AUTHOR).toEqual({ name: '', url: '' });

        const source = read('public/scripts/extension-host-domain.js');
        expect(source).not.toMatch(/\$\(|document\.|#extensions_settings|rm_extensions_block/i);
        expect(source).not.toMatch(/\bjQuery\s*\(/i);
    });

    test('host service owns discover/activate planning/operations/extras without drawer DOM', async () => {
        const serviceModule = await import(`../public/scripts/extension-host-service.js?t=${Date.now()}`);

        /** @type {Record<string, any>} */
        const settings = {
            apiUrl: 'http://localhost:5100',
            apiKey: 'secret',
            autoConnect: true,
            notifyUpdates: false,
            disabledExtensions: [],
        };
        const discovered = [
            { name: 'regex', type: 'system' },
            { name: 'third-party/demo', type: 'local' },
            { name: 'third-party/dep', type: 'local' },
        ];
        const manifestsByName = {
            regex: { display_name: 'Regex', loading_order: 1, js: 'index.js' },
            'third-party/dep': { display_name: 'Dep', loading_order: 5, js: 'index.js' },
            'third-party/demo': {
                display_name: 'Demo',
                loading_order: 10,
                js: 'index.js',
                dependencies: ['third-party/dep'],
            },
        };
        /** @type {Array<{url: string, init?: object}>} */
        const fetches = [];
        /** @type {string[]} */
        const activated = [];
        /** @type {Array<{name: string, hook: string}>} */
        const hooks = [];
        /** @type {Array<{title: string, failureClass: string|null}>} */
        const failures = [];
        let saveCount = 0;
        let reloadCount = 0;

        const session = serviceModule.createExtensionHostSession({
            getSettings: () => settings,
            setSettings: (next) => {
                Object.assign(settings, next);
            },
            saveSettings: async () => {
                saveCount += 1;
            },
            getClientVersion: () => '1.12.0',
            discoverExtensions: async () => discovered,
            fetchManifest: async (name) => manifestsByName[name] || null,
            fetchJson: async (url, init = {}) => {
                fetches.push({ url, init });
                if (String(url).includes('/api/extensions/update')) {
                    return {
                        ok: false,
                        status: 409,
                        statusText: 'Conflict',
                        text: async () => JSON.stringify({
                            ok: false,
                            message: 'dirty',
                            reason: 'dirty-worktree',
                            failureClass: 'user_action_required',
                            actionHints: ['commit_or_stash_local_changes'],
                        }),
                        json: async () => ({}),
                    };
                }
                if (String(url).includes('/api/extensions/install')) {
                    return {
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        text: async () => '',
                        json: async () => ({
                            display_name: 'Installed',
                            extensionPath: '/tmp/x',
                            folderName: 'installed',
                        }),
                    };
                }
                if (String(url).includes('/api/modules')) {
                    return {
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        text: async () => '',
                        json: async () => ({ modules: ['caption', 'classify'] }),
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: async () => '',
                    json: async () => ({}),
                };
            },
            injectExtensionAssets: async (name) => {
                activated.push(name);
            },
            callExtensionHook: async (name, hook) => {
                hooks.push({ name, hook });
            },
            notifyOperationFailure: (error, title) => {
                failures.push({ title, failureClass: error?.failureClass ?? null });
            },
            notifySuccess: () => {},
            notifyInfo: () => {},
            reloadPage: () => {
                reloadCount += 1;
            },
            onStateChange: () => {},
            isAdmin: () => true,
            getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
            isOfficialExtension: (url) => String(url).includes('DabengBa'),
            confirmThirdPartyInstall: async () => true,
            confirmDelete: async () => ({ confirmed: true, shouldClean: false }),
        });

        expect(session.getDeferredLoaderState()).toBe('idle');
        session.setDeferredLoader(async () => {}, { state: 'loading' });
        expect(session.getDeferredLoaderState()).toBe('loading');

        const loadResult = await session.loadAndActivate({});
        expect(loadResult.ok).toBe(true);
        expect(session.getExtensionNames()).toEqual(['regex', 'third-party/demo', 'third-party/dep']);
        expect(session.getExtensionTypes()['third-party/demo']).toBe('local');
        expect(activated).toEqual(expect.arrayContaining(['regex', 'third-party/dep', 'third-party/demo']));
        // dependency order: dep before demo
        expect(activated.indexOf('third-party/dep')).toBeLessThan(activated.indexOf('third-party/demo'));
        expect(session.getActiveExtensions().has('third-party/demo')).toBe(true);
        expect(session.getDeferredLoaderState()).toBe('idle');

        const updateResult = await session.updateExtension('demo', { quiet: false });
        expect(updateResult.ok).toBe(false);
        expect(updateResult.failureClass).toBe('user_action_required');
        expect(updateResult.reason).toBe('dirty-worktree');
        expect(failures.some(f => f.failureClass === 'user_action_required')).toBe(true);

        const installResult = await session.installExtension('https://github.com/other/repo', false, '');
        expect(installResult.ok).toBe(true);
        expect(hooks.some(h => h.hook === 'install')).toBe(true);

        await session.enableExtension('third-party/demo', { reload: false });
        expect(settings.disabledExtensions).not.toContain('third-party/demo');
        expect(saveCount).toBeGreaterThan(0);

        await session.disableExtension('third-party/demo', { reload: false });
        expect(settings.disabledExtensions).toContain('third-party/demo');
        expect(reloadCount).toBe(0);

        const extras = await session.connectExtrasApi('http://localhost:5100');
        expect(extras.ok).toBe(true);
        expect(session.getExtrasModules()).toEqual(['caption', 'classify']);
        expect(session.isExtrasConnected()).toBe(true);

        session.setNotifyUpdates(true);
        expect(settings.notifyUpdates).toBe(true);
        session.setAutoconnect(false);
        expect(settings.autoConnect).toBe(false);
        session.setApiUrl('http://localhost:5200');
        expect(settings.apiUrl).toBe('http://localhost:5200');
        session.setApiKey('next');
        expect(settings.apiKey).toBe('next');

        const snapshot = session.getHostStateSnapshot();
        expect(snapshot).toMatchObject({
            deferredState: 'idle',
            extrasConnected: true,
            notifyUpdates: true,
            autoConnect: false,
            apiUrl: 'http://localhost:5200',
            apiKeySet: true,
        });
        expect(Array.isArray(snapshot.extensionNames)).toBe(true);

        const source = read('public/scripts/extension-host-service.js');
        expect(source).not.toMatch(/#extensions_settings|#extensionsMenuButton|rm_extensions_block|\$\(['"]#/i);
    });

    test('extensions.js barrel reuses domain/service modules for lifecycle, operations, and extras', () => {
        const extensionsSource = read('public/scripts/extensions.js');
        expect(extensionsSource).toMatch(/from ['"]\.\/extension-host-domain\.js['"]/);
        expect(extensionsSource).toMatch(/from ['"]\.\/extension-host-service\.js['"]/);
        expect(extensionsSource).toContain('createExtensionHostSession');
        expect(extensionsSource).toContain('parseExtensionOperationErrorBody');
        expect(extensionsSource).toContain('evaluateExtensionActivation');
        // Public compatibility surface remains on the barrel.
        expect(extensionsSource).toContain('export async function loadExtensionSettings');
        expect(extensionsSource).toContain('export async function installExtension');
        expect(extensionsSource).toContain('export async function deleteExtension');
        expect(extensionsSource).toContain('export async function enableExtension');
        expect(extensionsSource).toContain('export async function doExtrasFetch');
    });
});

describe('extension compatibility slots', () => {
    test('slot manager claims stable IDs without remounting content on re-ensure', async () => {
        const mod = await import(`../public/scripts/extension-compatibility-slots.js?t=${Date.now()}`);

        function createDoc() {
            const byId = new Map();
            const body = {
                children: [],
                appendChild(node) {
                    this.children.push(node);
                    if (node.id) {
                        byId.set(node.id, node);
                    }
                    return node;
                },
            };
            return {
                body,
                getElementById(id) {
                    return byId.get(id) || null;
                },
                createElement(tag) {
                    const attrs = {};
                    const node = {
                        tagName: String(tag).toUpperCase(),
                        className: '',
                        children: [],
                        textContent: '',
                        _id: '',
                        setAttribute(k, v) {
                            attrs[k] = String(v);
                        },
                        getAttribute(k) {
                            return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
                        },
                        removeAttribute(k) {
                            delete attrs[k];
                        },
                        appendChild(child) {
                            this.children.push(child);
                            if (child.id) {
                                byId.set(child.id, child);
                            }
                            return child;
                        },
                    };
                    Object.defineProperty(node, 'id', {
                        get() {
                            return this._id || '';
                        },
                        set(v) {
                            this._id = v;
                            if (v) {
                                byId.set(v, this);
                            }
                        },
                    });
                    return node;
                },
            };
        }

        const doc = createDoc();
        const existing = doc.createElement('div');
        existing.id = 'extensions_settings';
        const child = doc.createElement('div');
        child.id = 'tavern_helper';
        existing.appendChild(child);
        doc.body.appendChild(existing);

        const manager = mod.createExtensionCompatibilitySlotManager(doc);
        const first = manager.ensureSlots({
            owner: 'react-extensions-host',
            parentForSettings: doc.body,
            parentForSettings2: doc.body,
            parentForMenu: doc.body,
        });
        expect(first.find(s => s.id === 'extensions_settings')?.ready).toBe(true);
        expect(first.find(s => s.id === 'regex_container')?.ready).toBe(true);
        expect(first.every(s => s.ready)).toBe(true);
        const gen1 = manager.getGeneration();

        const second = manager.ensureSlots({
            owner: 'react-extensions-host',
            parentForSettings: doc.body,
            parentForSettings2: doc.body,
            parentForMenu: doc.body,
        });
        expect(manager.getGeneration()).toBe(gen1);
        expect(doc.getElementById('tavern_helper')).toBe(child);
        expect(second.find(s => s.id === 'extensions_settings')?.owned).toBe(true);

        manager.ensureSlots({
            owner: 'other-owner',
            parentForSettings: doc.body,
            parentForSettings2: doc.body,
            parentForMenu: doc.body,
        });
        expect(manager.getGeneration()).toBeGreaterThan(gen1);
        expect(doc.getElementById('tavern_helper')).toBe(child);

        const source = read('public/scripts/extension-compatibility-slots.js');
        expect(source).toContain('extensions_settings');
        expect(source).toContain('extensions_settings2');
        expect(source).toContain('regex_container');
        expect(source).toContain('extensionsMenuButton');
        expect(source).toContain('extensionsMenu');
        expect(source).not.toMatch(/innerHTML\s*=/);
    });

    test('React Extensions Host owns lifecycle slots and session-backed deferred state', () => {
        const workspacePanelSource = read('app/workspace-panels.tsx');
        const scriptSource = read('public/script.js');
        const extensionsSource = read('public/scripts/extensions.js');

        expect(workspacePanelSource).toContain('data-extensions-host-compat-slot=');
        expect(workspacePanelSource).toContain('data-extensions-host-compat-slot="extensions_settings"');
        expect(workspacePanelSource).toContain('data-extensions-host-compat-slot="extensions_settings2"');
        expect(workspacePanelSource).toContain('data-extensions-host-compat-slot="regex_container"');
        expect(workspacePanelSource).toContain('ensureExtensionCompatibilitySlots');
        expect(workspacePanelSource).toContain('retryDeferredExtensions');
        expect(workspacePanelSource).toContain('legacyBoundary="react-owned-slots-lifecycle"');
        // Protected IDs remain outside React JSX so unmount cannot destroy extension content.
        expect(workspacePanelSource).not.toContain('id="extensions_settings"');
        expect(workspacePanelSource).not.toContain('id="regex_container"');

        expect(scriptSource).toContain('getExtensionHostSession');
        expect(scriptSource).toContain('extension-compatibility-slots');
        // Retry must re-run deferred load, not open Manage as a substitute.
        expect(scriptSource).toContain("case 'retryDeferredExtensions'");
        expect(scriptSource).toContain('return retryDeferredExtensionsHostLoad()');
        expect(scriptSource).not.toMatch(/case 'retryDeferredExtensions':\s*return openExtensionsHostManager\(\)/);

        expect(extensionsSource).toContain('getExtensionCompatibilitySlotManager');
        expect(extensionsSource).toContain('ensureExtensionCompatibilitySlots');
        expect(extensionsSource).toContain('export async function retryDeferredExtensionsHostLoad()');
    });
});
