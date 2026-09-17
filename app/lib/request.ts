let cachedCsrfToken: string | null = null;

/**
 * Fetches (and caches) the session CSRF token for authenticated API calls.
 * Matches the legacy getRequestHeaders() contract: JSON body + X-CSRF-Token.
 */
export async function getCsrfToken(): Promise<string> {
    if (cachedCsrfToken) {
        return cachedCsrfToken;
    }

    const response = await fetch('/csrf-token');
    if (!response.ok) {
        throw new Error('Failed to obtain CSRF token.');
    }

    const data: unknown = await response.json();
    const token = (data as { token?: unknown })?.token;
    if (typeof token !== 'string' || token.length === 0) {
        throw new Error('Failed to obtain CSRF token.');
    }

    cachedCsrfToken = token;
    return token;
}

export function invalidateCsrfToken() {
    cachedCsrfToken = null;
}

interface ApiFetchInit {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    omitContentType?: boolean;
}

/**
 * Authenticated fetch for EmberDesk private API endpoints.
 * Sends the CSRF token and a JSON body by default, mirroring getRequestHeaders().
 */
export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
    const token = await getCsrfToken();
    const headers: Record<string, string> = { 'X-CSRF-Token': token };
    if (!init.omitContentType) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, {
        method: init.method ?? 'POST',
        headers,
        body: init.body === undefined || init.body instanceof FormData ? (init.body as BodyInit | undefined) : JSON.stringify(init.body),
        signal: init.signal,
    });

    if (response.status === 403) {
        invalidateCsrfToken();
    }

    return response;
}
