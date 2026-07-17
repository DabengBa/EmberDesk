/**
 * Stateful Extension Host session: discovery, activation planning, install/update/delete,
 * enable/disable, and Extras API connection.
 * Framework-neutral; no drawer DOM or React dependency.
 */

import {
    buildExtensionOperationFailureFeedback,
    evaluateExtensionActivation,
    getAuthorFromUrl,
    isOfficialExtension as defaultIsOfficialExtension,
    parseExtensionOperationErrorBody,
    sortManifestsByOrder,
    stripThirdPartyPrefix,
} from './extension-host-domain.js';

/**
 * @typedef {object} ExtensionHostFetchResponse
 * @property {boolean} ok
 * @property {number} [status]
 * @property {string} [statusText]
 * @property {() => Promise<string>} text
 * @property {() => Promise<any>} json
 */

/**
 * @typedef {object} ExtensionHostSessionDeps
 * @property {() => object} getSettings
 * @property {(next: object) => void} setSettings
 * @property {() => Promise<void>|void} [saveSettings]
 * @property {() => string} getClientVersion
 * @property {() => Promise<Array<{name: string, type: string}>>} discoverExtensions
 * @property {(name: string) => Promise<object|null>} fetchManifest
 * @property {(url: string|URL, init?: object) => Promise<ExtensionHostFetchResponse>} fetchJson
 * @property {(name: string, manifest: object) => Promise<void>|void} injectExtensionAssets
 * @property {(name: string, hook: string) => Promise<void>|void} [callExtensionHook]
 * @property {(error: object, title: string) => void} [notifyOperationFailure]
 * @property {(message: string, title?: string) => void} [notifySuccess]
 * @property {(message: string, title?: string) => void} [notifyInfo]
 * @property {(message: string, title?: string) => void} [notifyError]
 * @property {() => void} [reloadPage]
 * @property {(detail?: object) => void} [onStateChange]
 * @property {() => boolean} [isAdmin]
 * @property {() => object} [getRequestHeaders]
 * @property {(url: string) => boolean} [isOfficialExtension]
 * @property {(url: string) => Promise<boolean>|boolean} [confirmThirdPartyInstall]
 * @property {(extensionName: string, options?: {hasCleanHook?: boolean}) => Promise<{confirmed: boolean, shouldClean?: boolean}>| {confirmed: boolean, shouldClean?: boolean}} [confirmDelete]
 * @property {(error: object) => string} [formatFailureTitle]
 * @property {Record<string, string>} [reasonMessages]
 * @property {Record<string, string>} [actionHintMessages]
 * @property {string} [fallbackFailureMessage]
 */

/**
 * @param {ExtensionHostSessionDeps} deps
 */
export function createExtensionHostSession(deps) {
    if (!deps || typeof deps.getSettings !== 'function' || typeof deps.setSettings !== 'function') {
        throw new Error('createExtensionHostSession requires getSettings and setSettings');
    }
    if (typeof deps.discoverExtensions !== 'function') {
        throw new Error('createExtensionHostSession requires discoverExtensions');
    }
    if (typeof deps.fetchManifest !== 'function') {
        throw new Error('createExtensionHostSession requires fetchManifest');
    }
    if (typeof deps.fetchJson !== 'function') {
        throw new Error('createExtensionHostSession requires fetchJson');
    }
    if (typeof deps.injectExtensionAssets !== 'function') {
        throw new Error('createExtensionHostSession requires injectExtensionAssets');
    }
    if (typeof deps.getClientVersion !== 'function') {
        throw new Error('createExtensionHostSession requires getClientVersion');
    }

    /** @type {string[]} */
    let extensionNames = [];
    /** @type {Record<string, string>} */
    let extensionTypes = {};
    /** @type {Record<string, object>} */
    let manifests = {};
    /** @type {Set<string>} */
    const activeExtensions = new Set();
    /** @type {Set<string>} */
    const extensionLoadErrors = new Set();
    /** @type {string[]} */
    let extrasModules = [];
    let extrasConnected = false;
    /** @type {null|(() => Promise<void>|void)} */
    let deferredLoader = null;
    /** @type {'idle'|'loading'|'failed'} */
    let deferredLoaderState = 'idle';
    let requiresReload = false;
    let stateChanged = false;

    function getSettings() {
        return deps.getSettings() || {};
    }

    function mutateSettings(mutator) {
        const current = { ...getSettings() };
        mutator(current);
        deps.setSettings(current);
        emitStateChange();
    }

    function emitStateChange(detail = {}) {
        if (typeof deps.onStateChange === 'function') {
            deps.onStateChange({ ...getHostStateSnapshot(), ...detail });
        }
    }

    function getRequestHeaders() {
        return typeof deps.getRequestHeaders === 'function' ? (deps.getRequestHeaders() || {}) : {};
    }

    function isOfficial(url) {
        if (typeof deps.isOfficialExtension === 'function') {
            return deps.isOfficialExtension(url);
        }
        return defaultIsOfficialExtension(url);
    }

    async function readOperationError(response) {
        const text = await response.text();
        return parseExtensionOperationErrorBody(text, response.statusText || '');
    }

    function presentOperationFailure(error, title) {
        const feedback = buildExtensionOperationFailureFeedback(error, {
            reasonMessages: deps.reasonMessages || {},
            actionHintMessages: deps.actionHintMessages || {},
            fallbackMessage: deps.fallbackFailureMessage || 'Extension operation failed',
        });
        if (typeof deps.notifyOperationFailure === 'function') {
            deps.notifyOperationFailure({ ...error, ...feedback }, title);
        }
        return feedback;
    }

    function getExtensionType(externalId) {
        const key = externalId.startsWith('third-party')
            ? externalId
            : Object.keys(extensionTypes).find(name => name.endsWith(externalId) || name === externalId);
        if (key && extensionTypes[key]) {
            return extensionTypes[key];
        }
        if (extensionTypes[externalId]) {
            return extensionTypes[externalId];
        }
        // Fall back to name-based lookup used by legacy callers
        const full = externalId.startsWith('third-party') ? externalId : `third-party/${stripThirdPartyPrefix(externalId)}`;
        return extensionTypes[full] || extensionTypes[externalId] || 'local';
    }

    async function getManifests(names) {
        /** @type {Record<string, object>} */
        const obj = {};
        await Promise.allSettled(names.map(async (name) => {
            try {
                const manifest = await deps.fetchManifest(name);
                if (manifest && typeof manifest === 'object') {
                    obj[name] = manifest;
                }
            } catch (error) {
                console.log('Could not load manifest.json for ' + name, error);
            }
        }));
        return obj;
    }

    async function activateExtensions() {
        extensionLoadErrors.clear();
        const clientVersion = String(deps.getClientVersion() || '0.0.0').split(':').pop();
        const settings = getSettings();
        const disabledExtensions = Array.isArray(settings.disabledExtensions) ? settings.disabledExtensions : [];
        const ordered = Object.entries(manifests).sort((a, b) => sortManifestsByOrder(a[1], b[1]));
        const knownNames = ordered.map(([name]) => name);
        /** @type {Promise<void>[]} */
        const promises = [];

        for (const [name, manifest] of ordered) {
            const decision = evaluateExtensionActivation({
                name,
                manifest,
                clientVersion,
                extrasModules,
                knownExtensionNames: knownNames,
                disabledExtensions,
                isAlreadyActive: activeExtensions.has(name),
            });

            if (decision.isAlreadyActive) {
                continue;
            }

            if (decision.shouldActivate) {
                try {
                    const promise = Promise.resolve(deps.injectExtensionAssets(name, manifest))
                        .then(async () => {
                            activeExtensions.add(name);
                            if (typeof deps.callExtensionHook === 'function') {
                                await deps.callExtensionHook(name, 'activate');
                            }
                        })
                        .catch((err) => {
                            console.log('Could not activate extension', name, err);
                            extensionLoadErrors.add(`Extension "${decision.displayName}" failed to load: ${err}`);
                        });
                    promises.push(promise);
                    await promise;
                } catch (error) {
                    console.error('Could not activate extension', name, error);
                }
            } else if (!decision.meetsModuleRequirements && !decision.isDisabled) {
                extensionLoadErrors.add(
                    `Extension "${decision.displayName}" did not load. Missing required Extras module(s): "${decision.missingModules.join(', ')}"`,
                );
            } else if (!decision.meetsExtensionDeps && !decision.isDisabled) {
                if (decision.disabledDependencies.length > 0) {
                    extensionLoadErrors.add(
                        `Extension "${decision.displayName}" did not load. Required extensions exist but are disabled: "${decision.disabledDependencies.join(', ')}". Enable them first, then reload.`,
                    );
                } else {
                    extensionLoadErrors.add(
                        `Extension "${decision.displayName}" did not load. Missing required extensions: "${decision.missingDependencies.join(', ')}"`,
                    );
                }
            } else if (!decision.meetsClientMinimumVersion && !decision.isDisabled) {
                extensionLoadErrors.add(
                    `Extension "${decision.displayName}" did not load. Requires ST client version ${manifest.minimum_client_version}, but current version is ${clientVersion}.`,
                );
            }
        }

        await Promise.allSettled(promises);
        emitStateChange({ loadErrors: [...extensionLoadErrors] });
        return {
            ok: true,
            active: [...activeExtensions],
            loadErrors: [...extensionLoadErrors],
        };
    }

    /**
     * @param {object} [settingsPatch]
     * @param {{versionChanged?: boolean, enableAutoUpdate?: boolean, autoUpdate?: () => Promise<void>}} [options]
     */
    async function loadAndActivate(settingsPatch = {}, options = {}) {
        if (settingsPatch && typeof settingsPatch === 'object' && Object.keys(settingsPatch).length > 0) {
            if (settingsPatch.extension_settings && typeof settingsPatch.extension_settings === 'object') {
                mutateSettings((settings) => {
                    Object.assign(settings, settingsPatch.extension_settings);
                });
            } else {
                mutateSettings((settings) => {
                    Object.assign(settings, settingsPatch);
                });
            }
        }

        const discovered = await deps.discoverExtensions();
        extensionNames = (discovered || []).map(x => x.name);
        extensionTypes = Object.fromEntries((discovered || []).map(x => [x.name, x.type]));
        manifests = await getManifests(extensionNames);

        if (options.versionChanged && options.enableAutoUpdate && typeof options.autoUpdate === 'function') {
            await options.autoUpdate();
        }

        const activation = await activateExtensions();

        const settings = getSettings();
        if (settings.autoConnect && settings.apiUrl) {
            await connectExtrasApi(settings.apiUrl);
        }

        setDeferredLoader(null);
        return {
            ok: true,
            extensionNames: [...extensionNames],
            activation,
        };
    }

    function setDeferredLoader(loader = null, { state } = {}) {
        deferredLoader = typeof loader === 'function' ? loader : null;
        deferredLoaderState = deferredLoader
            ? (state ?? 'loading')
            : 'idle';
        emitStateChange({ deferredState: deferredLoaderState });
    }

    function getDeferredLoaderState() {
        return deferredLoaderState;
    }

    async function ensureDeferredReady() {
        if (!deferredLoader) {
            return { ok: true, skipped: true };
        }
        if (deferredLoaderState === 'failed') {
            setDeferredLoader(deferredLoader, { state: 'loading' });
        }
        try {
            await deferredLoader();
            return { ok: true };
        } catch (error) {
            setDeferredLoader(deferredLoader, { state: 'failed' });
            throw error;
        }
    }

    /**
     * @param {string} extensionName
     * @param {{quiet?: boolean, timeout?: number|null}} [options]
     */
    async function updateExtension(extensionName, { quiet = false, timeout = null } = {}) {
        try {
            const signal = timeout ? AbortSignal.timeout(timeout) : undefined;
            const response = await deps.fetchJson('/api/extensions/update', {
                method: 'POST',
                signal,
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    extensionName,
                    global: getExtensionType(extensionName) === 'global',
                }),
            });

            if (!response.ok) {
                const error = await readOperationError(response);
                if (!quiet) {
                    presentOperationFailure(error, 'Extension update failed');
                }
                return {
                    ok: false,
                    reason: error.reason,
                    failureClass: error.failureClass,
                    message: error.message,
                    actionHints: error.actionHints,
                };
            }

            const data = await response.json();
            if (!data.isUpToDate) {
                const fullName = extensionName.startsWith('third-party')
                    ? extensionName
                    : `third-party/${stripThirdPartyPrefix(extensionName)}`;
                if (typeof deps.callExtensionHook === 'function') {
                    await deps.callExtensionHook(fullName, 'update');
                }
                if (!quiet && typeof deps.notifySuccess === 'function') {
                    deps.notifySuccess(
                        `Extension ${extensionName} updated to ${data.shortCommitHash}`,
                        'Reload the page to apply updates',
                    );
                }
            } else if (!quiet && typeof deps.notifySuccess === 'function') {
                deps.notifySuccess('Extension is already up to date');
            }

            return { ok: true, data };
        } catch (error) {
            console.error('Extension update error:', error);
            return { ok: false, message: String(error?.message || error) };
        }
    }

    /**
     * @param {string} url
     * @param {boolean} global
     * @param {string} [branch]
     */
    async function installExtension(url, global, branch = '') {
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('Invalid URL protocol');
            }
            url = parsedUrl.href;
        } catch (error) {
            console.error('Invalid URL:', error);
            if (typeof deps.notifyError === 'function') {
                deps.notifyError('Only valid HTTP and HTTPS URLs are allowed.', 'Invalid URL');
            }
            return { ok: false, reason: 'invalid-url', failureClass: 'invalid_request' };
        }

        if (!isOfficial(url) && typeof deps.confirmThirdPartyInstall === 'function') {
            const confirmed = await deps.confirmThirdPartyInstall(url);
            if (!confirmed) {
                return { ok: false, cancelled: true };
            }
        }

        if (typeof deps.notifyInfo === 'function') {
            deps.notifyInfo('Please wait...', 'Installing extension');
        }

        const response = await deps.fetchJson('/api/extensions/install', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ url, global, branch }),
        });

        if (!response.ok) {
            const error = await readOperationError(response);
            presentOperationFailure(error, 'Extension installation failed');
            return {
                ok: false,
                reason: error.reason,
                failureClass: error.failureClass,
                message: error.message,
                actionHints: error.actionHints,
            };
        }

        const payload = await response.json();
        if (typeof deps.notifySuccess === 'function') {
            deps.notifySuccess(
                `Extension '${payload.display_name}' has been installed successfully!`,
                'Extension installation successful',
            );
        }

        if (payload.folderName && typeof deps.callExtensionHook === 'function') {
            await deps.callExtensionHook(`third-party/${payload.folderName}`, 'install');
        }

        return { ok: true, data: payload };
    }

    /**
     * @param {string} extensionName
     * @param {{shouldClean?: boolean, skipConfirm?: boolean}} [options]
     */
    async function deleteExtension(extensionName, { shouldClean = false, skipConfirm = true } = {}) {
        const fullName = extensionName.startsWith('third-party')
            ? extensionName
            : `third-party/${stripThirdPartyPrefix(extensionName)}`;

        if (!skipConfirm && typeof deps.confirmDelete === 'function') {
            const confirmation = await deps.confirmDelete(extensionName, {
                hasCleanHook: false,
            });
            if (!confirmation?.confirmed) {
                return { ok: false, cancelled: true };
            }
            shouldClean = Boolean(confirmation.shouldClean);
        }

        if (shouldClean && typeof deps.callExtensionHook === 'function') {
            await deps.callExtensionHook(fullName, 'clean');
        }
        if (typeof deps.callExtensionHook === 'function') {
            await deps.callExtensionHook(fullName, 'delete');
        }

        try {
            const response = await deps.fetchJson('/api/extensions/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    extensionName,
                    global: getExtensionType(extensionName) === 'global',
                }),
            });
            if (!response.ok) {
                const error = await readOperationError(response);
                presentOperationFailure(error, 'Extension delete failed');
                return {
                    ok: false,
                    reason: error.reason,
                    failureClass: error.failureClass,
                    message: error.message,
                    actionHints: error.actionHints,
                };
            }
        } catch (error) {
            console.error('Error:', error);
            if (typeof deps.notifyError === 'function') {
                deps.notifyError('Extension delete failed');
            }
            return { ok: false, message: String(error?.message || error) };
        }

        if (typeof deps.saveSettings === 'function') {
            await deps.saveSettings();
        }
        if (typeof deps.notifySuccess === 'function') {
            deps.notifySuccess(`Extension ${extensionName} deleted`);
        }
        if (typeof deps.reloadPage === 'function') {
            deps.reloadPage();
        }
        return { ok: true };
    }

    /**
     * @param {string} extensionName
     * @param {boolean} isGlobal
     * @param {string} branch
     */
    async function switchBranch(extensionName, isGlobal, branch) {
        try {
            const response = await deps.fetchJson('/api/extensions/switch', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    extensionName,
                    branch,
                    global: isGlobal,
                }),
            });
            if (!response.ok) {
                const error = await readOperationError(response);
                presentOperationFailure(error, 'Extension branch switch failed');
                return {
                    ok: false,
                    reason: error.reason,
                    failureClass: error.failureClass,
                    message: error.message,
                    actionHints: error.actionHints,
                };
            }
            if (typeof deps.notifySuccess === 'function') {
                deps.notifySuccess(
                    `Extension ${extensionName} switched to ${branch}`,
                    'Reload the page to apply updates',
                );
            }
            return { ok: true };
        } catch (error) {
            console.error('Error:', error);
            return { ok: false, message: String(error?.message || error) };
        }
    }

    /**
     * Move an extension between local and global scopes.
     * Endpoint contract: `{ extensionName, source, destination }` (not a boolean `global` flag).
     * @param {string} extensionName
     * @param {{source?: string, destination?: string, global?: boolean}} [options]
     *   Prefer `source`/`destination`. Legacy `global: true` means move local→global;
     *   `global: false` means move global→local when source/destination are omitted.
     */
    async function moveExtension(extensionName, { source, destination, global } = {}) {
        try {
            let resolvedSource = source;
            let resolvedDestination = destination;
            if (!resolvedSource || !resolvedDestination) {
                // Map optional boolean form to the real endpoint scopes.
                if (global === true) {
                    resolvedSource = resolvedSource || 'local';
                    resolvedDestination = resolvedDestination || 'global';
                } else if (global === false) {
                    resolvedSource = resolvedSource || 'global';
                    resolvedDestination = resolvedDestination || 'local';
                } else {
                    resolvedSource = resolvedSource || 'local';
                    resolvedDestination = resolvedDestination || 'global';
                }
            }

            const response = await deps.fetchJson('/api/extensions/move', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    extensionName,
                    source: resolvedSource,
                    destination: resolvedDestination,
                }),
            });
            if (!response.ok) {
                const error = await readOperationError(response);
                presentOperationFailure(error, 'Extension move failed');
                return {
                    ok: false,
                    reason: error.reason,
                    failureClass: error.failureClass,
                    message: error.message,
                    actionHints: error.actionHints,
                };
            }
            if (typeof deps.notifySuccess === 'function') {
                deps.notifySuccess(`Extension ${extensionName} moved`);
            }
            // 204 No Content is valid; avoid forcing json parse.
            const data = typeof response.json === 'function'
                ? await response.json().catch(() => ({}))
                : {};
            return { ok: true, data };
        } catch (error) {
            console.error('Error:', error);
            return { ok: false, message: String(error?.message || error) };
        }
    }

    /**
     * @param {string} name
     * @param {{reload?: boolean}} [options]
     */
    async function enableExtension(name, { reload = true } = {}) {
        if (typeof deps.callExtensionHook === 'function') {
            await deps.callExtensionHook(name, 'enable');
        }
        mutateSettings((settings) => {
            const disabled = Array.isArray(settings.disabledExtensions) ? settings.disabledExtensions : [];
            settings.disabledExtensions = disabled.filter(x => x !== name);
        });
        stateChanged = true;
        if (typeof deps.saveSettings === 'function') {
            await deps.saveSettings();
        }
        if (reload && typeof deps.reloadPage === 'function') {
            deps.reloadPage();
        } else {
            requiresReload = true;
        }
        return { ok: true, requiresReload };
    }

    /**
     * @param {string} name
     * @param {{reload?: boolean}} [options]
     */
    async function disableExtension(name, { reload = true } = {}) {
        if (typeof deps.callExtensionHook === 'function') {
            await deps.callExtensionHook(name, 'disable');
        }
        mutateSettings((settings) => {
            const disabled = Array.isArray(settings.disabledExtensions) ? [...settings.disabledExtensions] : [];
            if (!disabled.includes(name)) {
                disabled.push(name);
            }
            settings.disabledExtensions = disabled;
        });
        stateChanged = true;
        if (typeof deps.saveSettings === 'function') {
            await deps.saveSettings();
        }
        if (reload && typeof deps.reloadPage === 'function') {
            deps.reloadPage();
        } else {
            requiresReload = true;
        }
        return { ok: true, requiresReload };
    }

    /**
     * @param {string} baseUrl
     */
    async function connectExtrasApi(baseUrl) {
        if (!baseUrl) {
            extrasConnected = false;
            emitStateChange();
            return { ok: false, reason: 'missing-url' };
        }

        try {
            const url = new URL(baseUrl);
            url.pathname = '/api/modules';
            const settings = getSettings();
            /** @type {Record<string, string>} */
            const headers = {};
            if (settings.apiKey) {
                headers.Authorization = `Bearer ${settings.apiKey}`;
            }
            const response = await deps.fetchJson(url, {
                method: 'GET',
                headers,
            });
            if (response.ok) {
                const data = await response.json();
                extrasModules = Array.isArray(data.modules) ? data.modules : [];
                extrasConnected = true;
                await activateExtensions();
                emitStateChange({ extrasConnected: true, modules: [...extrasModules] });
                return { ok: true, modules: [...extrasModules] };
            }
            extrasConnected = false;
            emitStateChange({ extrasConnected: false });
            return { ok: false, status: response.status };
        } catch (error) {
            extrasConnected = false;
            emitStateChange({ extrasConnected: false });
            return { ok: false, message: String(error?.message || error) };
        }
    }

    function setNotifyUpdates(enabled) {
        mutateSettings((settings) => {
            settings.notifyUpdates = Boolean(enabled);
        });
        return { ok: true, notifyUpdates: Boolean(enabled) };
    }

    function setAutoconnect(enabled) {
        mutateSettings((settings) => {
            settings.autoConnect = Boolean(enabled);
        });
        return { ok: true, autoConnect: Boolean(enabled) };
    }

    function setApiUrl(url) {
        mutateSettings((settings) => {
            settings.apiUrl = String(url ?? '');
        });
        return { ok: true, apiUrl: String(url ?? '') };
    }

    function setApiKey(apiKey) {
        mutateSettings((settings) => {
            settings.apiKey = String(apiKey ?? '');
        });
        return { ok: true, apiKeySet: Boolean(apiKey) };
    }

    function getHostStateSnapshot() {
        const settings = getSettings();
        return {
            deferredState: deferredLoaderState,
            extrasConnected,
            modules: [...extrasModules],
            extensionNames: [...extensionNames],
            extensionTypes: { ...extensionTypes },
            activeExtensions: [...activeExtensions],
            loadErrors: [...extensionLoadErrors],
            notifyUpdates: Boolean(settings.notifyUpdates),
            autoConnect: Boolean(settings.autoConnect),
            apiUrl: String(settings.apiUrl || ''),
            apiKeySet: Boolean(settings.apiKey),
            requiresReload,
            stateChanged,
        };
    }

    function findExtension(name) {
        const internalExtensionName = extensionNames.find(extName => {
            return equalsIgnoreCase(extName, name) || equalsIgnoreCase(extName, `third-party/${name}`);
        });
        if (!internalExtensionName) {
            return null;
        }
        const settings = getSettings();
        const disabled = Array.isArray(settings.disabledExtensions) ? settings.disabledExtensions : [];
        return {
            name: internalExtensionName,
            enabled: !disabled.includes(internalExtensionName),
        };
    }

    function getExtensionManifest(name) {
        const found = extensionNames.find(extName =>
            equalsIgnoreCase(extName, name) || equalsIgnoreCase(extName, `third-party/${name}`),
        );
        const manifest = found ? manifests[found] : null;
        return manifest ? structuredClone(manifest) : null;
    }

    return {
        loadAndActivate,
        activateExtensions,
        setDeferredLoader,
        getDeferredLoaderState,
        ensureDeferredReady,
        updateExtension,
        installExtension,
        deleteExtension,
        switchBranch,
        moveExtension,
        enableExtension,
        disableExtension,
        connectExtrasApi,
        setNotifyUpdates,
        setAutoconnect,
        setApiUrl,
        setApiKey,
        getHostStateSnapshot,
        getExtensionNames: () => [...extensionNames],
        getExtensionTypes: () => ({ ...extensionTypes }),
        getManifests: () => ({ ...manifests }),
        getActiveExtensions: () => new Set(activeExtensions),
        getLoadErrors: () => new Set(extensionLoadErrors),
        getExtrasModules: () => [...extrasModules],
        isExtrasConnected: () => extrasConnected,
        getExtensionType,
        findExtension,
        getExtensionManifest,
        getAuthorFromUrl,
        requiresReload: () => requiresReload,
        markRequiresReload: (value = true) => {
            requiresReload = Boolean(value);
        },
        consumeStateChanged: () => {
            const value = stateChanged;
            stateChanged = false;
            return value;
        },
        // Direct mutable mirrors for barrel compatibility during migration.
        _syncPublicMirrors(mirrors) {
            if (!mirrors) {
                return;
            }
            if (mirrors.extensionNames) {
                mirrors.extensionNames.length = 0;
                mirrors.extensionNames.push(...extensionNames);
            }
            if (mirrors.extensionTypes) {
                for (const key of Object.keys(mirrors.extensionTypes)) {
                    delete mirrors.extensionTypes[key];
                }
                Object.assign(mirrors.extensionTypes, extensionTypes);
            }
            if (mirrors.modules) {
                mirrors.modules.length = 0;
                mirrors.modules.push(...extrasModules);
            }
        },
        _replaceManifests(next) {
            manifests = next && typeof next === 'object' ? next : {};
        },
        _setExtrasModules(next) {
            extrasModules = Array.isArray(next) ? [...next] : [];
        },
        _setExtrasConnected(value) {
            extrasConnected = Boolean(value);
        },
    };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function equalsIgnoreCase(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'accent' }) === 0;
}

export {
    buildExtensionOperationFailureFeedback,
    evaluateExtensionActivation,
    getAuthorFromUrl,
    parseExtensionOperationErrorBody,
    sortManifestsByOrder,
} from './extension-host-domain.js';
