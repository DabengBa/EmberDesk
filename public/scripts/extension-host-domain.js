/**
 * Pure Extension Host helpers: sorting, official URL checks, activation decisions,
 * operation-error envelopes, and author extraction.
 * Framework-neutral; no DOM, jQuery, or React dependency.
 */

/**
 * Sentinel value representing an empty author.
 * @type {{name: string, url: string}}
 */
export const EMPTY_AUTHOR = Object.freeze({
    name: '',
    url: '',
});

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isOfficialExtension(url) {
    try {
        return /^https:\/\/github\.com\/DabengBa\/(.+)$/i.test(new URL(url).href);
    } catch {
        return false;
    }
}

/**
 * @param {string} name
 * @param {{prefix?: string}} [options]
 * @returns {string}
 */
export function getNameSelector(name, { prefix = 'third-party' } = {}) {
    const nameWithoutPrefix = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(nameWithoutPrefix);
    }
    return String(nameWithoutPrefix).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

/**
 * @param {{loading_order?: number|string, display_name?: string}} a
 * @param {{loading_order?: number|string, display_name?: string}} b
 * @returns {number}
 */
export function sortManifestsByOrder(a, b) {
    return parseInt(/** @type {any} */ (a).loading_order) - parseInt(/** @type {any} */ (b).loading_order)
        || String(a.display_name).localeCompare(String(b.display_name));
}

/**
 * @param {{loading_order?: number|string, display_name?: string}} a
 * @param {{loading_order?: number|string, display_name?: string}} b
 * @returns {number}
 */
export function sortManifestsByName(a, b) {
    return String(a.display_name).localeCompare(String(b.display_name))
        || parseInt(/** @type {any} */ (a).loading_order) - parseInt(/** @type {any} */ (b).loading_order);
}

/**
 * @param {unknown[]} haystack
 * @param {unknown[]} needles
 * @returns {boolean}
 */
export function isSubsetOf(haystack, needles) {
    return (Array.isArray(haystack) && Array.isArray(needles))
        ? needles.every(val => haystack.includes(val))
        : false;
}

/**
 * @param {string} srcVersion
 * @param {string} minVersion
 * @returns {boolean}
 */
export function versionCompare(srcVersion, minVersion) {
    return (srcVersion || '0.0.0').localeCompare(minVersion, undefined, { numeric: true, sensitivity: 'base' }) > -1;
}

/**
 * Decide whether an extension should activate under current module/dep/version constraints.
 * @param {object} input
 * @param {string} input.name
 * @param {object} input.manifest
 * @param {string} input.clientVersion
 * @param {string[]} input.extrasModules
 * @param {string[]} input.knownExtensionNames
 * @param {string[]} input.disabledExtensions
 * @param {boolean} input.isAlreadyActive
 * @returns {{
 *   shouldActivate: boolean,
 *   isDisabled: boolean,
 *   isAlreadyActive: boolean,
 *   meetsModuleRequirements: boolean,
 *   meetsExtensionDeps: boolean,
 *   meetsClientMinimumVersion: boolean,
 *   missingModules: string[],
 *   missingDependencies: string[],
 *   disabledDependencies: string[],
 *   displayName: string,
 * }}
 */
export function evaluateExtensionActivation({
    name,
    manifest = {},
    clientVersion = '0.0.0',
    extrasModules = [],
    knownExtensionNames = [],
    disabledExtensions = [],
    isAlreadyActive = false,
} = {}) {
    const displayName = manifest.display_name || name;
    const isDisabled = Array.isArray(disabledExtensions) && disabledExtensions.includes(name);

    if (isAlreadyActive) {
        return {
            shouldActivate: false,
            isDisabled,
            isAlreadyActive: true,
            meetsModuleRequirements: true,
            meetsExtensionDeps: true,
            meetsClientMinimumVersion: true,
            missingModules: [],
            missingDependencies: [],
            disabledDependencies: [],
            displayName,
        };
    }

    let meetsClientMinimumVersion = true;
    if (manifest.minimum_client_version !== undefined && manifest.minimum_client_version !== null) {
        meetsClientMinimumVersion = versionCompare(clientVersion, String(manifest.minimum_client_version));
    }

    let meetsModuleRequirements = true;
    /** @type {string[]} */
    let missingModules = [];
    if (manifest.requires !== undefined) {
        if (Array.isArray(manifest.requires)) {
            meetsModuleRequirements = isSubsetOf(extrasModules, manifest.requires);
            missingModules = manifest.requires.filter(req => !extrasModules.includes(req));
        }
    }

    let meetsExtensionDeps = true;
    /** @type {string[]} */
    let missingDependencies = [];
    /** @type {string[]} */
    let disabledDependencies = [];
    if (manifest.dependencies !== undefined) {
        if (Array.isArray(manifest.dependencies)) {
            meetsExtensionDeps = isSubsetOf(knownExtensionNames, manifest.dependencies);
            missingDependencies = manifest.dependencies.filter(dep => !knownExtensionNames.includes(dep));
            if (meetsExtensionDeps) {
                disabledDependencies = manifest.dependencies.filter(dep => disabledExtensions.includes(dep));
                if (disabledDependencies.length > 0) {
                    meetsExtensionDeps = false;
                }
            }
        }
    }

    const shouldActivate = meetsModuleRequirements
        && meetsExtensionDeps
        && meetsClientMinimumVersion
        && !isDisabled;

    return {
        shouldActivate,
        isDisabled,
        isAlreadyActive: false,
        meetsModuleRequirements,
        meetsExtensionDeps,
        meetsClientMinimumVersion,
        missingModules,
        missingDependencies,
        disabledDependencies,
        displayName,
    };
}

/**
 * Parse a structured extension operation failure envelope from a response body string.
 * @param {string} text
 * @param {string} [statusText='']
 * @returns {{message: string, reason: string|null, failureClass: string|null, actionHints: string[], raw: object|null}}
 */
export function parseExtensionOperationErrorBody(text, statusText = '') {
    const body = typeof text === 'string' ? text : '';
    try {
        const data = JSON.parse(body);
        if (data && typeof data === 'object' && (data.reason || data.failureClass || data.message || data.ok === false)) {
            return {
                message: typeof data.message === 'string' && data.message
                    ? data.message
                    : (body || statusText),
                reason: typeof data.reason === 'string' ? data.reason : null,
                failureClass: typeof data.failureClass === 'string' ? data.failureClass : null,
                actionHints: Array.isArray(data.actionHints) ? data.actionHints : [],
                raw: data,
            };
        }
    } catch {
        // plain-text legacy body
    }

    return {
        message: body || statusText,
        reason: null,
        failureClass: null,
        actionHints: [],
        raw: null,
    };
}

/**
 * @param {{message?: string, reason?: string|null, failureClass?: string|null, actionHints?: string[]}|null|undefined} error
 * @param {{
 *   reasonMessages?: Record<string, string>,
 *   actionHintMessages?: Record<string, string>,
 *   fallbackMessage?: string,
 * }} [options]
 * @returns {{
 *   failureClass: string|null,
 *   reasonMessage: string,
 *   hintMessages: string[],
 *   message: string,
 * }}
 */
export function buildExtensionOperationFailureFeedback(error, {
    reasonMessages = {},
    actionHintMessages = {},
    fallbackMessage = 'Extension operation failed',
} = {}) {
    const reasonMessage = (error?.reason && reasonMessages[error.reason])
        || error?.message
        || fallbackMessage;
    const hintMessages = Array.isArray(error?.actionHints)
        ? error.actionHints.map(hint => actionHintMessages[hint]).filter(Boolean)
        : [];
    const hintMessage = hintMessages.length > 0
        ? `\n${hintMessages.map(hint => `• ${hint}`).join('\n')}`
        : '';

    return {
        failureClass: error?.failureClass ?? null,
        reasonMessage,
        hintMessages,
        message: `${reasonMessage}${hintMessage}`,
    };
}

/**
 * Extracts the repository author from a given URL.
 * @param {string} url
 * @returns {{name: string, url: string}}
 */
export function getAuthorFromUrl(url) {
    const result = structuredClone(EMPTY_AUTHOR);

    try {
        const parsedUrl = new URL(url);
        const pathSegments = parsedUrl.pathname.split('/').filter(s => s.length > 0);

        if (parsedUrl.host === 'github.com' && pathSegments.length >= 2) {
            result.name = pathSegments[0];
            result.url = `${parsedUrl.protocol}//${parsedUrl.hostname}/${result.name}`;
        }
    } catch {
        // leave empty author
    }

    return result;
}

/**
 * @param {string} name
 * @param {string} [prefix='third-party']
 * @returns {string}
 */
export function ensureThirdPartyExtensionName(name, prefix = 'third-party') {
    if (!name) {
        return name;
    }
    return name.startsWith(prefix) ? name : `${prefix}/${name.replace(/^\//, '')}`;
}

/**
 * Normalize extension folder names that may omit the third-party prefix for API calls.
 * @param {string} extensionName
 * @returns {string}
 */
export function stripThirdPartyPrefix(extensionName) {
    if (!extensionName) {
        return extensionName;
    }
    return extensionName.startsWith('third-party')
        ? extensionName.replace(/^third-party\/?/, '')
        : extensionName;
}
