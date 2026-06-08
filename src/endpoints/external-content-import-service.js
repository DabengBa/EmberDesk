import fetch from 'node-fetch';

function getUuidFromUrl(url) {
    const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;
    const matches = String(url ?? '').match(uuidRegex);
    return matches ? matches[0] : null;
}

function parseChubUrl(url) {
    const splitUrl = String(url ?? '').split('/');
    const length = splitUrl.length;

    if (length < 2) {
        return null;
    }

    let domainIndex = -1;
    splitUrl.forEach((part, index) => {
        if (part === 'www.chub.ai' || part === 'chub.ai' || part === 'www.characterhub.org' || part === 'characterhub.org') {
            domainIndex = index;
        }
    });

    const lastTwo = domainIndex !== -1 ? splitUrl.slice(domainIndex + 1) : splitUrl;
    const firstPart = lastTwo[0].toLowerCase();

    if (firstPart === 'characters' || firstPart === 'lorebooks') {
        const type = firstPart === 'characters' ? 'character' : 'lorebook';
        const id = type === 'character' ? lastTwo.slice(1).join('/') : lastTwo.join('/');
        return { id, type };
    }

    if (length === 2) {
        return {
            id: lastTwo.join('/'),
            type: 'character',
        };
    }

    return null;
}

function parseAICC(url) {
    try {
        const urlObject = new URL(url);
        const parts = urlObject.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
        }
    } catch {
        const parts = String(url ?? '').split('/').filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
        }
    }

    return null;
}

function parseRisuUrl(url) {
    const pattern = /^https?:\/\/realm\.risuai\.net\/character\/([a-f0-9-]+)\/?$/i;
    const match = String(url ?? '').match(pattern);
    return match ? match[1] : null;
}

function isPerchanceUUID(uuid) {
    if (!uuid) {
        return false;
    }

    return /^\w+~[a-f0-9]{32}\.gz$/.test(uuid);
}

function parsePerchanceSlug(url) {
    return String(url ?? '').split('~')[1] || '';
}

function okDescriptor(descriptor) {
    return { ok: true, descriptor };
}

function unsupportedHost(url, host) {
    return {
        ok: false,
        failure: {
            kind: 'unsupported_host',
            host,
            url,
        },
    };
}

export function getHostFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

export function isHostWhitelisted(host, allowlist = []) {
    return allowlist.includes(host);
}

export function classifyExternalContentUrl(url, allowlist = []) {
    const host = getHostFromUrl(url);

    if (!host) {
        return {
            ok: false,
            failure: {
                kind: 'invalid_url',
                url,
            },
        };
    }

    if (host.includes('pygmalion.chat')) {
        const id = getUuidFromUrl(url);
        return id
            ? okDescriptor({ source: 'pygmalion_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (host.includes('janitorai')) {
        const id = getUuidFromUrl(url);
        return id
            ? okDescriptor({ source: 'janitor_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (host.includes('aicharactercards.com')) {
        const id = parseAICC(url);
        return id
            ? okDescriptor({ source: 'aicc_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (host.includes('chub.ai') || host.includes('characterhub.org')) {
        const chub = parseChubUrl(url);
        if (chub?.type === 'character') {
            return okDescriptor({ source: 'chub_character', type: 'character', id: chub.id, url, host });
        }
        if (chub?.type === 'lorebook') {
            return okDescriptor({ source: 'chub_lorebook', type: 'lorebook', id: chub.id, url, host });
        }
        return unsupportedHost(url, host);
    }

    if (host.includes('realm.risuai.net')) {
        const id = parseRisuUrl(url);
        return id
            ? okDescriptor({ source: 'risu_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (host.includes('perchance.org')) {
        const id = parsePerchanceSlug(url);
        return id
            ? okDescriptor({ source: 'perchance_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (isHostWhitelisted(host, allowlist)) {
        return okDescriptor({ source: 'generic_png', type: 'character', id: url, url, host });
    }

    return unsupportedHost(url, host);
}

export function classifyExternalContentId(id) {
    const value = String(id ?? '');
    const isJanitor = value.includes('_character');
    const isPygmalion = !isJanitor && value.length === 36;
    const isAICC = value.startsWith('AICC/');
    const isPerchance = isPerchanceUUID(value);
    const uuidType = value.includes('lorebook') ? 'lorebook' : 'character';

    if (isPygmalion) {
        return okDescriptor({ source: 'pygmalion_character', type: 'character', id: value });
    }

    if (isJanitor) {
        return okDescriptor({ source: 'janitor_character', type: 'character', id: value.split('_')[0] });
    }

    if (isAICC) {
        const [, author, card] = value.split('/');
        return author && card
            ? okDescriptor({ source: 'aicc_character', type: 'character', id: `${author}/${card}` })
            : { ok: false, failure: { kind: 'invalid_artifact', source: 'aicc_character' } };
    }

    if (isPerchance) {
        return okDescriptor({ source: 'perchance_character', type: 'character', id: parsePerchanceSlug(value) });
    }

    if (uuidType === 'lorebook') {
        return okDescriptor({ source: 'chub_lorebook', type: 'lorebook', id: value });
    }

    return okDescriptor({ source: 'chub_character', type: 'character', id: value });
}

export async function fetchExternalResource({
    url,
    options = undefined,
    source = 'external',
    stage = 'artifact',
    requireOk = false,
    fetchImpl = fetch,
} = {}) {
    try {
        const response = await fetchImpl(url, options);
        if (requireOk && !response?.ok) {
            return {
                ok: false,
                response,
                failure: {
                    kind: 'provider_non_2xx',
                    source,
                    stage,
                    url,
                    status: response?.status,
                    statusText: response?.statusText,
                },
            };
        }

        return {
            ok: true,
            response,
            failure: response?.ok ? null : {
                kind: 'provider_non_2xx',
                source,
                stage,
                url,
                status: response?.status,
                statusText: response?.statusText,
            },
        };
    } catch (error) {
        return {
            ok: false,
            response: null,
            failure: {
                kind: 'network_error',
                source,
                stage,
                url,
                message: String(error?.message ?? error),
            },
        };
    }
}

export async function downloadExternalContentArtifact({
    descriptor,
    downloaders,
    fetchImpl = fetch,
} = {}) {
    const trace = [];
    const source = descriptor?.source;
    const downloader = downloaders?.[source];

    if (!descriptor || typeof downloader !== 'function') {
        return {
            ok: false,
            failure: {
                kind: 'unsupported_source',
                source,
            },
            trace,
        };
    }

    const fetchResource = async (request) => {
        const result = await fetchExternalResource({
            ...request,
            source: request.source ?? source,
            fetchImpl,
        });
        trace.push({
            source: request.source ?? source,
            stage: request.stage ?? 'artifact',
            url: request.url,
            ok: result.ok,
        });
        return result;
    };

    try {
        const artifact = await downloader(descriptor, { fetchExternalResource: fetchResource });

        if (!artifact?.buffer || !artifact?.fileName) {
            return {
                ok: false,
                failure: {
                    kind: 'invalid_artifact',
                    source,
                },
                trace,
            };
        }

        return {
            ok: true,
            artifact: {
                provider: source,
                source,
                type: descriptor.type,
                fileName: artifact.fileName,
                fileType: artifact.fileType,
                buffer: artifact.buffer,
            },
            trace,
        };
    } catch (error) {
        return {
            ok: false,
            failure: {
                kind: error?.failure?.kind ?? 'unexpected_error',
                source,
                message: String(error?.message ?? error),
            },
            trace,
        };
    }
}

export async function downloadExternalAsset({
    url,
    allowlist = [],
    fetchImpl = fetch,
} = {}) {
    const validation = validateExternalAssetUrl({ url, allowlist });

    if (!validation.ok) {
        return validation;
    }

    const result = await fetchExternalResource({
        url,
        source: 'asset_download',
        stage: 'asset',
        requireOk: true,
        fetchImpl,
    });

    if (!result.ok) {
        return {
            ok: false,
            failure: result.failure,
        };
    }

    if (result.response?.body === null) {
        return {
            ok: false,
            failure: {
                kind: 'invalid_artifact',
                source: 'asset_download',
                stage: 'asset',
                url,
            },
        };
    }

    return {
        ok: true,
        host: validation.host,
        response: result.response,
    };
}

export function validateExternalAssetUrl({
    url,
    allowlist = [],
} = {}) {
    const host = getHostFromUrl(url);

    if (!host) {
        return {
            ok: false,
            failure: {
                kind: 'invalid_url',
                url,
            },
        };
    }

    if (!isHostWhitelisted(host, allowlist)) {
        return unsupportedHost(url, host);
    }

    return {
        ok: true,
        host,
    };
}
