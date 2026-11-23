import fetch from 'node-fetch';
import { fetchExternalImport } from '../external-import-fetch.ts';
import type { RequestInit, Response } from 'node-fetch';

export type ExternalContentSource = 'pygmalion_character' | 'janitor_character' | 'aicc_character' | 'chub_character' | 'chub_lorebook' | 'risu_character' | 'perchance_character' | 'generic_png';
export type ExternalContentDescriptor = {
    id: string;
    url?: string;
    host?: string;
} & ({ source: 'chub_lorebook'; type: 'lorebook' } | { source: Exclude<ExternalContentSource, 'chub_lorebook'>; type: 'character' });
export type UrlFailure = { kind: 'invalid_url'; url: string | undefined } | { kind: 'unsupported_host'; host: string; url: string | undefined };
export type UrlClassification = { ok: true; descriptor: ExternalContentDescriptor & { url: string; host: string } } | { ok: false; failure: UrlFailure };
export type IdClassification = { ok: true; descriptor: ExternalContentDescriptor } | { ok: false; failure: { kind: 'invalid_artifact'; source: 'aicc_character' } };
export type FetchRequest = { url?: string; options?: RequestInit; source?: string; stage?: string; requireOk?: boolean };
export type FetchImplementation = typeof fetch;
export type ProviderFailure = { kind: 'provider_non_2xx'; source: string; stage: string; url: string | undefined; status: number | undefined; statusText: string | undefined };
export type NetworkFailure = { kind: 'network_error'; source: string; stage: string; url: string | undefined; message: string };
export type FetchResult =
    | { ok: true; response: Response; failure: ProviderFailure | null }
    | { ok: false; response: Response; failure: ProviderFailure }
    | { ok: false; response: null; failure: NetworkFailure };
export type FetchResource = (request: FetchRequest) => Promise<FetchResult>;
export type DownloadedArtifact = { buffer: Buffer; fileName: string; fileType?: string | null };
export type Downloader = (descriptor: ExternalContentDescriptor, dependencies: { fetchExternalResource: FetchResource }) => Promise<DownloadedArtifact | null | undefined>;
export type DownloadTrace = { source: string; stage: string; url: string | undefined; ok: boolean };
export type ArtifactResult =
    | { ok: true; artifact: DownloadedArtifact & { fileType: string | null | undefined; provider: ExternalContentSource; source: ExternalContentSource; type: ExternalContentDescriptor['type'] }; trace: DownloadTrace[] }
    | { ok: false; failure: { kind: 'unsupported_source'; source: ExternalContentSource | undefined } | { kind: 'invalid_artifact'; source: ExternalContentSource } | { kind: unknown; source: ExternalContentSource; message: string }; trace: DownloadTrace[] };
export type AssetValidation = { ok: true; host: string } | { ok: false; failure: UrlFailure };
export type AssetResult = { ok: true; host: string; response: Response } | { ok: false; failure: UrlFailure | ProviderFailure | NetworkFailure | { kind: 'invalid_artifact'; source: 'asset_download'; stage: 'asset'; url: string | undefined } };

// These are unchecked views, not validation: JS can throw primitives or values
// whose message/failure.kind are not strings. Optional property access is retained.
type ThrownValue = { message?: unknown; failure?: { kind?: unknown } } | null | undefined;

function getUuidFromUrl(url: string | undefined) {
    const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;
    const matches = String(url ?? '').match(uuidRegex);
    return matches ? matches[0] : null;
}

function parseChubUrl(url: string | undefined): { id: string; type: 'character' | 'lorebook' } | null {
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

function parseAICC(url: string | undefined) {
    try {
        const urlObject = new URL(url as string);
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

function parseRisuUrl(url: string | undefined) {
    const pattern = /^https?:\/\/realm\.risuai\.net\/character\/([a-f0-9-]+)\/?$/i;
    const match = String(url ?? '').match(pattern);
    return match ? match[1] : null;
}

function isPerchanceUUID(uuid: string) {
    if (!uuid) {
        return false;
    }

    return /^\w+~[a-f0-9]{32}\.gz$/.test(uuid);
}

function parsePerchanceSlug(url: string | undefined) {
    return String(url ?? '').split('~')[1] || '';
}

function okDescriptor<T extends ExternalContentDescriptor>(descriptor: T): { ok: true; descriptor: T } {
    return { ok: true, descriptor };
}

function normalizeHost(host: string | undefined) {
    return String(host ?? '').trim().toLowerCase().replace(/\.$/, '');
}

function isExactHost(host: string | undefined, allowedHosts: readonly string[]) {
    const normalizedHost = normalizeHost(host);
    return allowedHosts.some(allowedHost => normalizedHost === normalizeHost(allowedHost));
}

function unsupportedHost(url: string | undefined, host: string): { ok: false; failure: Extract<UrlFailure, { kind: 'unsupported_host' }> } {
    return {
        ok: false,
        failure: {
            kind: 'unsupported_host',
            host,
            url,
        },
    };
}

export function getHostFromUrl(url: string | undefined) {
    try {
        return normalizeHost(new URL(url as string).hostname);
    } catch {
        return '';
    }
}

export function isHostWhitelisted(host: string | undefined, allowlist: readonly string[] = []) {
    const normalizedHost = normalizeHost(host);
    return isExactHost(host, allowlist) || allowlist.some(allowedHost => {
        const normalizedAllowedHost = normalizeHost(allowedHost);
        if (!normalizedAllowedHost.startsWith('*.')) {
            return false;
        }
        const suffix = normalizedAllowedHost.slice(1);
        return normalizedHost.length > suffix.length && normalizedHost.endsWith(suffix);
    });
}

export function classifyExternalContentUrl(url: string, allowlist: readonly string[] = []): UrlClassification {
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

    if (isExactHost(host, ['pygmalion.chat', 'www.pygmalion.chat'])) {
        const id = getUuidFromUrl(url);
        return id
            ? okDescriptor({ source: 'pygmalion_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (isExactHost(host, ['janitorai.com', 'www.janitorai.com'])) {
        const id = getUuidFromUrl(url);
        return id
            ? okDescriptor({ source: 'janitor_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (isExactHost(host, ['aicharactercards.com', 'www.aicharactercards.com'])) {
        const id = parseAICC(url);
        return id
            ? okDescriptor({ source: 'aicc_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (isExactHost(host, ['chub.ai', 'www.chub.ai', 'characterhub.org', 'www.characterhub.org'])) {
        const chub = parseChubUrl(url);
        if (chub?.type === 'character') {
            return okDescriptor({ source: 'chub_character', type: 'character', id: chub.id, url, host });
        }
        if (chub?.type === 'lorebook') {
            return okDescriptor({ source: 'chub_lorebook', type: 'lorebook', id: chub.id, url, host });
        }
        return unsupportedHost(url, host);
    }

    if (isExactHost(host, ['realm.risuai.net'])) {
        const id = parseRisuUrl(url);
        return id
            ? okDescriptor({ source: 'risu_character', type: 'character', id, url, host })
            : unsupportedHost(url, host);
    }

    if (isExactHost(host, ['perchance.org', 'www.perchance.org'])) {
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

export function classifyExternalContentId(id: string | undefined): IdClassification {
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
    fetchImpl = fetchExternalImport,
}: FetchRequest & { fetchImpl?: FetchImplementation } = {}): Promise<FetchResult> {
    try {
        const response = await fetchImpl(url as string, options);
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
        const thrown = error as ThrownValue;
        return {
            ok: false,
            response: null,
            failure: {
                kind: 'network_error',
                source,
                stage,
                url,
                message: String(thrown?.message ?? error),
            },
        };
    }
}

export async function downloadExternalContentArtifact({
    descriptor,
    downloaders,
    fetchImpl = fetchExternalImport,
}: { descriptor?: ExternalContentDescriptor; downloaders?: Partial<Record<ExternalContentSource, Downloader>>; fetchImpl?: FetchImplementation } = {}): Promise<ArtifactResult> {
    const trace: DownloadTrace[] = [];
    // The descriptor's typed source is present after the guard; preserve the
    // original optional read for callers passing missing or unchecked values.
    const source = descriptor?.source as ExternalContentSource;
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

    const fetchResource: FetchResource = async (request) => {
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
        const thrown = error as ThrownValue;
        return {
            ok: false,
            failure: {
                kind: thrown?.failure?.kind ?? 'unexpected_error',
                source,
                message: String(thrown?.message ?? error),
            },
            trace,
        };
    }
}

export async function downloadExternalAsset({
    url,
    allowlist = [],
    fetchImpl = fetchExternalImport,
}: { url?: string; allowlist?: readonly string[]; fetchImpl?: FetchImplementation } = {}): Promise<AssetResult> {
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
}: { url?: string; allowlist?: readonly string[] } = {}): AssetValidation {
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
